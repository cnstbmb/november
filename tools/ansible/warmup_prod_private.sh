#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY_PATH="${ROOT_DIR}/.private/ansible/prod/hosts.yml"
ANSIBLE_CONFIG_DEFAULT="${ROOT_DIR}/ansible.cfg"
LOCAL_TMP_DEFAULT="${ROOT_DIR}/.tmp/ansible-local"
CONNECT_TIMEOUT=10
LIMIT_TARGET=""

usage() {
  cat <<EOF
Usage:
  tools/ansible/warmup_prod_private.sh [options]

Options:
  --limit <pattern>      Ограничить прогрев по хостам/группам
  --timeout <seconds>    SSH connect timeout (default: 10)
  -h, --help             Показать помощь
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --limit)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --limit"
        exit 1
      fi
      LIMIT_TARGET="$2"
      shift 2
      ;;
    --timeout)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --timeout"
        exit 1
      fi
      CONNECT_TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! command -v ansible-inventory >/dev/null 2>&1; then
  echo "ansible-inventory not found. Install Ansible first."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found."
  exit 1
fi

if [ ! -f "${INVENTORY_PATH}" ]; then
  echo "Private inventory not found: ${INVENTORY_PATH}"
  echo "Run tools/ansible/bootstrap_private_vars.sh first."
  exit 1
fi

mkdir -p "${LOCAL_TMP_DEFAULT}"
if [ -z "${ANSIBLE_LOCAL_TEMP:-}" ]; then
  export ANSIBLE_LOCAL_TEMP="${LOCAL_TMP_DEFAULT}"
fi

if [ -z "${ANSIBLE_CONFIG:-}" ] && [ -f "${ANSIBLE_CONFIG_DEFAULT}" ]; then
  export ANSIBLE_CONFIG="${ANSIBLE_CONFIG_DEFAULT}"
fi

host_lines="$(
  inventory_json_file="$(mktemp "${TMPDIR:-/tmp}/ansible-inventory.XXXXXX.json")"
  trap 'rm -f "${inventory_json_file}"' EXIT

  ansible-inventory -i "${INVENTORY_PATH}" --list > "${inventory_json_file}"

  python3 - "${LIMIT_TARGET}" "${inventory_json_file}" <<'PY'
import fnmatch
import json
import sys

limit = (sys.argv[1] or "").strip()
inventory_json_path = sys.argv[2]
with open(inventory_json_path, "r", encoding="utf-8") as f:
    data = json.load(f)
hostvars = data.get("_meta", {}).get("hostvars", {})
all_hosts = list(hostvars.keys())
selected = []

def add(hostname: str) -> None:
    if hostname in hostvars and hostname not in selected:
        selected.append(hostname)

if limit:
    tokens = [token.strip() for token in limit.split(",") if token.strip()]
    for token in tokens:
        group_hosts = data.get(token, {}).get("hosts", [])
        if group_hosts:
            for host in group_hosts:
                add(host)
            continue

        if token in hostvars:
            add(token)
            continue

        for host in all_hosts:
            if fnmatch.fnmatch(host, token):
                add(host)
else:
    for group_name in ("master", "workers"):
        for host in data.get(group_name, {}).get("hosts", []):
            add(host)
    for host in all_hosts:
        add(host)

for host in selected:
    hv = hostvars.get(host, {})
    user = str(hv.get("ansible_user", "")).strip()
    addr = str(hv.get("ansible_host", host)).strip() or host
    port = hv.get("ansible_port", 22)
    print(f"{host}\t{user}\t{addr}\t{port}")
PY
)"

if [ -z "${host_lines}" ]; then
  if [ -n "${LIMIT_TARGET}" ]; then
    echo "No hosts matched limit: ${LIMIT_TARGET}"
  else
    echo "No hosts found in inventory."
  fi
  exit 1
fi

failed_hosts=()

while IFS=$'\t' read -r host_name host_user host_addr host_port; do
  [ -z "${host_name}" ] && continue

  if [ -z "${host_user}" ]; then
    host_user="root"
  fi

  if [ -z "${host_addr}" ]; then
    host_addr="${host_name}"
  fi

  if [ -z "${host_port}" ]; then
    host_port="22"
  fi

  echo "Warmup: ${host_name} (${host_user}@${host_addr}:${host_port})"
  if ssh -n \
    -o BatchMode=no \
    -o KbdInteractiveAuthentication=yes \
    -o ConnectTimeout="${CONNECT_TIMEOUT}" \
    -p "${host_port}" \
    "${host_user}@${host_addr}" \
    "exit"; then
    echo "  OK: ${host_name}"
  else
    echo "  FAIL: ${host_name}" >&2
    failed_hosts+=("${host_name}")
  fi
done <<< "${host_lines}"

if [ "${#failed_hosts[@]}" -gt 0 ]; then
  echo "Warmup finished with failures: ${failed_hosts[*]}" >&2
  exit 1
fi

echo "Warmup finished: all hosts reachable."
