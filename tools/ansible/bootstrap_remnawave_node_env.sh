#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIVATE_DIR="${ROOT_DIR}/.private/ansible/prod"
INVENTORY_PATH="${PRIVATE_DIR}/hosts.yml"
WORKERS_VARS_PATH="${PRIVATE_DIR}/group_vars/workers.yml"
NODE_ENV_DIR="${PRIVATE_DIR}/remnawave-node"
HOST_VARS_DIR="${PRIVATE_DIR}/host_vars"
DEFAULT_NODE_ENV_DEST="/opt/remnawave-node/.env"
DEFAULT_NODE_COMPOSE_SRC="${ROOT_DIR}/deployments/prod/remnawave-node/docker-compose.yml"
DEFAULT_NODE_COMPOSE_DEST_DIR="/opt/remnawave-node"
DEFAULT_NODE_COMPOSE_DEST_FILE="/opt/remnawave-node/docker-compose.yml"

usage() {
  cat <<EOF
Usage:
  tools/ansible/bootstrap_remnawave_node_env.sh

Interactive helper:
  - reads workers from ${INVENTORY_PATH}
  - asks NODE_PORT and SECRET_KEY/SSL_CERT for each worker
  - writes private env files in ${NODE_ENV_DIR}
  - writes host vars in ${HOST_VARS_DIR}/<worker>/remnawave_node.yml
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

extract_worker_hosts() {
  local inventory_json_file
  inventory_json_file="$(mktemp "${TMPDIR:-/tmp}/ansible-inventory.XXXXXX")"
  ANSIBLE_LOCAL_TEMP="${ROOT_DIR}/.tmp/ansible-local" \
    ansible-inventory -i "${INVENTORY_PATH}" --list > "${inventory_json_file}"
  python3 - "${inventory_json_file}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
workers = data.get("workers", {}).get("hosts", [])
for host in workers:
    if isinstance(host, str) and host.strip():
        print(host.strip())
PY
  rm -f "${inventory_json_file}"
}

ensure_workers_group_vars() {
  local tmp_file
  mkdir -p "$(dirname "${WORKERS_VARS_PATH}")"
  if [ ! -f "${WORKERS_VARS_PATH}" ]; then
    cat > "${WORKERS_VARS_PATH}" <<EOF
enable_remnawave_node: true
node_compose_src: "${DEFAULT_NODE_COMPOSE_SRC}"
node_compose_dest_dir: "${DEFAULT_NODE_COMPOSE_DEST_DIR}"
node_compose_dest_file: "${DEFAULT_NODE_COMPOSE_DEST_FILE}"
node_env_src: ""
node_env_dest: "${DEFAULT_NODE_ENV_DEST}"
EOF
    return
  fi

  if grep -q '^enable_remnawave_node:' "${WORKERS_VARS_PATH}"; then
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
    ' "${WORKERS_VARS_PATH}" > "${tmp_file}"
    mv "${tmp_file}" "${WORKERS_VARS_PATH}"
  else
    printf '\nenable_remnawave_node: true\n' >> "${WORKERS_VARS_PATH}"
  fi

  if ! grep -q '^node_compose_src:' "${WORKERS_VARS_PATH}"; then
    printf 'node_compose_src: "%s"\n' "${DEFAULT_NODE_COMPOSE_SRC}" >> "${WORKERS_VARS_PATH}"
  fi
  if ! grep -q '^node_compose_dest_dir:' "${WORKERS_VARS_PATH}"; then
    printf 'node_compose_dest_dir: "%s"\n' "${DEFAULT_NODE_COMPOSE_DEST_DIR}" >> "${WORKERS_VARS_PATH}"
  fi
  if ! grep -q '^node_compose_dest_file:' "${WORKERS_VARS_PATH}"; then
    printf 'node_compose_dest_file: "%s"\n' "${DEFAULT_NODE_COMPOSE_DEST_FILE}" >> "${WORKERS_VARS_PATH}"
  fi
  if ! grep -q '^node_env_dest:' "${WORKERS_VARS_PATH}"; then
    printf 'node_env_dest: "%s"\n' "${DEFAULT_NODE_ENV_DEST}" >> "${WORKERS_VARS_PATH}"
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

workers="$(extract_worker_hosts)"
if [ -z "${workers}" ]; then
  echo "No workers found in inventory: ${INVENTORY_PATH}"
  exit 1
fi

if [ ! -f "${DEFAULT_NODE_COMPOSE_SRC}" ]; then
  echo "Worker compose file not found: ${DEFAULT_NODE_COMPOSE_SRC}"
  echo "Create it first (for example from tools/ansible/remnawave/worker-node.docker-compose.example.yml)."
  exit 1
fi

ensure_workers_group_vars
mkdir -p "${NODE_ENV_DIR}"
mkdir -p "${HOST_VARS_DIR}"

echo "=== Remnawave Node env bootstrap ==="
echo "For each worker paste value from panel Nodes -> Management."
echo "Both legacy and current formats are written (.env will contain APP_PORT/NODE_PORT and SSL_CERT/SECRET_KEY)."

while IFS= read -r worker; do
  [ -z "${worker}" ] && continue

  env_file="${NODE_ENV_DIR}/${worker}.env"
  host_vars_worker_dir="${HOST_VARS_DIR}/${worker}"
  host_vars_worker_file="${host_vars_worker_dir}/remnawave_node.yml"

  existing_port=""
  existing_secret=""
  if [ -f "${env_file}" ]; then
    existing_port="$(grep -E '^(NODE_PORT|APP_PORT)=' "${env_file}" | head -n1 | cut -d'=' -f2- || true)"
    existing_secret="$(grep -E '^(SECRET_KEY|SSL_CERT)=' "${env_file}" | head -n1 | cut -d'=' -f2- || true)"
  fi

  node_port_default="${existing_port:-2222}"
  node_secret_default="${existing_secret:-}"

  prompt node_port "Node port for ${worker}" "${node_port_default}"
  prompt node_secret_input "SECRET_KEY/SSL_CERT for ${worker}" "${node_secret_default}"
  if [ -z "${node_secret_input}" ]; then
    echo "Secret for ${worker} is required."
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

  mkdir -p "${host_vars_worker_dir}"
  cat > "${host_vars_worker_file}" <<EOF
node_env_src: "${env_file}"
node_env_dest: "${DEFAULT_NODE_ENV_DEST}"
EOF

  echo "Prepared: ${env_file}"
  echo "Prepared: ${host_vars_worker_file}"
done <<< "${workers}"

echo "Done. Now run:"
echo "  npm run ansible:run:check -- --limit workers"
echo "  npm run ansible:workers"
