#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIVATE_DIR="${ROOT_DIR}/.private/ansible/prod"
INVENTORY_PATH="${PRIVATE_DIR}/hosts.yml"
MASTER_VARS_PATH="${PRIVATE_DIR}/group_vars/master.yml"
WORKERS_VARS_PATH="${PRIVATE_DIR}/group_vars/workers.yml"
NODE_ENV_DIR="${PRIVATE_DIR}/remnawave-node"
HOST_VARS_DIR="${PRIVATE_DIR}/host_vars"
DEFAULT_NODE_ENV_DEST="/opt/remnawave-node/.env"
DEFAULT_NODE_COMPOSE_SRC="deployments/prod/remnawave-node/docker-compose.yml"
DEFAULT_NODE_COMPOSE_DEST_DIR="/opt/remnawave-node"
DEFAULT_NODE_COMPOSE_DEST_FILE="/opt/remnawave-node/docker-compose.yml"

usage() {
  cat <<EOF
Usage:
  tools/ansible/bootstrap_remnawave_node_env.sh

Interactive helper:
  - reads master/workers from ${INVENTORY_PATH}
  - asks NODE_PORT and SECRET_KEY/SSL_CERT for each selected host
  - writes private env files in ${NODE_ENV_DIR}
  - writes host vars in ${HOST_VARS_DIR}/<host>/remnawave_node.yml
EOF
}

prompt() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-}"
  local value

  if [ -n "${default_value}" ]; then
    read -r -p "${message} [${default_value}]: " value < /dev/tty
    value="${value:-${default_value}}"
  else
    read -r -p "${message}: " value < /dev/tty
  fi

  printf -v "${var_name}" "%s" "${value}"
}

prompt_bool() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-false}"
  local value

  while true; do
    read -r -p "${message} [y/n, default: ${default_value}]: " value < /dev/tty
    value="${value:-${default_value}}"
    case "${value}" in
      y|Y|yes|YES|true|TRUE|1) printf -v "${var_name}" "true"; return ;;
      n|N|no|NO|false|FALSE|0) printf -v "${var_name}" "false"; return ;;
      *) echo "Введите y или n." ;;
    esac
  done
}

extract_group_hosts() {
  local group_name="$1"
  local inventory_json_file
  inventory_json_file="$(mktemp "${TMPDIR:-/tmp}/ansible-inventory.XXXXXX")"
  ANSIBLE_LOCAL_TEMP="${ROOT_DIR}/.tmp/ansible-local" \
    ansible-inventory -i "${INVENTORY_PATH}" --list > "${inventory_json_file}"
  python3 - "${inventory_json_file}" "${group_name}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
group_name = sys.argv[2]
hosts = data.get(group_name, {}).get("hosts", [])
for host in hosts:
    if isinstance(host, str) and host.strip():
        print(host.strip())
PY
  rm -f "${inventory_json_file}"
}

current_group_enabled() {
  local vars_path="$1"
  if [ ! -f "${vars_path}" ]; then
    printf 'false'
    return
  fi

  awk -F': *' '
    /^enable_remnawave_node:/ {
      value = tolower($2)
      gsub(/["'\'' ]/, "", value)
      if (value == "true") {
        print "true"
      } else {
        print "false"
      }
      found = 1
      exit
    }
    END {
      if (found != 1) {
        print "false"
      }
    }
  ' "${vars_path}"
}

ensure_group_vars() {
  local vars_path="$1"
  local tmp_file
  mkdir -p "$(dirname "${vars_path}")"
  if [ ! -f "${vars_path}" ]; then
    cat > "${vars_path}" <<EOF
enable_remnawave_node: true
node_compose_src: "${DEFAULT_NODE_COMPOSE_SRC}"
node_compose_dest_dir: "${DEFAULT_NODE_COMPOSE_DEST_DIR}"
node_compose_dest_file: "${DEFAULT_NODE_COMPOSE_DEST_FILE}"
node_env_src: ""
node_env_dest: "${DEFAULT_NODE_ENV_DEST}"
EOF
    return
  fi

  if grep -q '^enable_remnawave_node:' "${vars_path}"; then
    tmp_file="$(mktemp "${TMPDIR:-/tmp}/workers-vars.XXXXXX")"
    awk '
      BEGIN { updated = 0 }
      /^enable_remnawave_node:/ {
        print "enable_remnawave_node: true"
        updated = 1
        next
      }
      { print }
      END {
        if (updated == 0) {
          print "enable_remnawave_node: true"
        }
      }
    ' "${vars_path}" > "${tmp_file}"
    mv "${tmp_file}" "${vars_path}"
  else
    printf '\nenable_remnawave_node: true\n' >> "${vars_path}"
  fi

  if ! grep -q '^node_compose_src:' "${vars_path}"; then
    printf 'node_compose_src: "%s"\n' "${DEFAULT_NODE_COMPOSE_SRC}" >> "${vars_path}"
  fi
  if ! grep -q '^node_compose_dest_dir:' "${vars_path}"; then
    printf 'node_compose_dest_dir: "%s"\n' "${DEFAULT_NODE_COMPOSE_DEST_DIR}" >> "${vars_path}"
  fi
  if ! grep -q '^node_compose_dest_file:' "${vars_path}"; then
    printf 'node_compose_dest_file: "%s"\n' "${DEFAULT_NODE_COMPOSE_DEST_FILE}" >> "${vars_path}"
  fi
  if ! grep -q '^node_env_dest:' "${vars_path}"; then
    printf 'node_env_dest: "%s"\n' "${DEFAULT_NODE_ENV_DEST}" >> "${vars_path}"
  fi
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! command -v ansible-inventory >/dev/null 2>&1; then
  echo "ansible-inventory not found. Install Ansible first."
  exit 1
fi

if [ ! -f "${INVENTORY_PATH}" ]; then
  echo "Private inventory not found: ${INVENTORY_PATH}"
  echo "Run tools/ansible/bootstrap_private_vars.sh first."
  exit 1
fi

mkdir -p "${ROOT_DIR}/.tmp/ansible-local"

master_hosts="$(extract_group_hosts master)"
worker_hosts="$(extract_group_hosts workers)"

if [ ! -f "${ROOT_DIR}/${DEFAULT_NODE_COMPOSE_SRC}" ]; then
  echo "Remnawave node compose file not found: ${ROOT_DIR}/${DEFAULT_NODE_COMPOSE_SRC}"
  echo "Create it first (for example from tools/ansible/remnawave/worker-node.docker-compose.example.yml)."
  exit 1
fi

master_enabled_default="$(current_group_enabled "${MASTER_VARS_PATH}")"
workers_enabled_default="$(current_group_enabled "${WORKERS_VARS_PATH}")"

echo "=== Remnawave Node env bootstrap ==="
echo "For each selected host paste value from panel Nodes -> Management."
echo "Both legacy and current formats are written (.env will contain APP_PORT/NODE_PORT and SSL_CERT/SECRET_KEY)."

selected_hosts=""
if [ -n "${master_hosts}" ]; then
  prompt_bool include_master "Включить remnawave_node на master?" "${master_enabled_default}"
  if [ "${include_master}" = "true" ]; then
    ensure_group_vars "${MASTER_VARS_PATH}"
    selected_hosts="${selected_hosts}"$'\n'"${master_hosts}"
  fi
fi

if [ -n "${worker_hosts}" ]; then
  prompt_bool include_workers "Включить remnawave_node на workers?" "${workers_enabled_default}"
  if [ "${include_workers}" = "true" ]; then
    ensure_group_vars "${WORKERS_VARS_PATH}"
    selected_hosts="${selected_hosts}"$'\n'"${worker_hosts}"
  fi
fi

selected_hosts="$(printf '%s\n' "${selected_hosts}" | awk 'NF' | awk '!seen[$0]++')"
if [ -z "${selected_hosts}" ]; then
  echo "No hosts selected for remnawave_node."
  exit 0
fi

mkdir -p "${NODE_ENV_DIR}"
mkdir -p "${HOST_VARS_DIR}"

while IFS= read -r host_name; do
  [ -z "${host_name}" ] && continue

  env_file="${NODE_ENV_DIR}/${host_name}.env"
  host_vars_host_dir="${HOST_VARS_DIR}/${host_name}"
  host_vars_host_file="${host_vars_host_dir}/remnawave_node.yml"

  existing_port=""
  existing_secret=""
  if [ -f "${env_file}" ]; then
    existing_port="$(grep -E '^(NODE_PORT|APP_PORT)=' "${env_file}" | head -n1 | cut -d'=' -f2- || true)"
    existing_secret="$(grep -E '^(SECRET_KEY|SSL_CERT)=' "${env_file}" | head -n1 | cut -d'=' -f2- || true)"
  fi

  node_port_default="${existing_port:-2222}"
  node_secret_default="${existing_secret:-}"

  prompt node_port "Node port for ${host_name}" "${node_port_default}"
  prompt node_secret_input "SECRET_KEY/SSL_CERT for ${host_name}" "${node_secret_default}"
  if [ -z "${node_secret_input}" ]; then
    echo "Secret for ${host_name} is required."
    exit 1
  fi

  node_secret="${node_secret_input}"
  node_secret="${node_secret#SECRET_KEY=}"
  node_secret="${node_secret#SSL_CERT=}"

  cat > "${env_file}" <<EOF
NODE_PORT=${node_port}
APP_PORT=${node_port}
SECRET_KEY=${node_secret}
SSL_CERT=${node_secret}
EOF
  chmod 600 "${env_file}"

  mkdir -p "${host_vars_host_dir}"
  cat > "${host_vars_host_file}" <<EOF
node_env_src: "${env_file}"
node_env_dest: "${DEFAULT_NODE_ENV_DEST}"
EOF

  echo "Prepared: ${env_file}"
  echo "Prepared: ${host_vars_host_file}"
done <<< "${selected_hosts}"

echo "Done. Now run:"
echo "  npm run ansible:run:check"
echo "  npm run ansible:site"
