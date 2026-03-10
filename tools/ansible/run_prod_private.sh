#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY_PATH="${ROOT_DIR}/.private/ansible/prod/hosts.yml"
PLAYBOOK_PATH="${ROOT_DIR}/ansible/playbooks/site.yml"
ANSIBLE_CONFIG_DEFAULT="${ROOT_DIR}/ansible.cfg"
ROLES_PATH_DEFAULT="${ROOT_DIR}/ansible/roles"
LOCAL_TMP_DEFAULT="${ROOT_DIR}/.tmp/ansible-local"
SSH_COMMON_ARGS_DEFAULT="-o BatchMode=no -o KbdInteractiveAuthentication=yes"
CHECK_MODE=false
MENU_MODE=false

detect_pkcs11_provider() {
  if [ -n "${ANSIBLE_PKCS11_PROVIDER:-}" ]; then
    echo "${ANSIBLE_PKCS11_PROVIDER}"
    return
  fi

  if command -v ssh >/dev/null 2>&1; then
    ssh -G 127.0.0.1 2>/dev/null | awk '/^pkcs11provider / { print $2; exit }'
  fi
}

preload_yubikey_key() {
  if [ "${ANSIBLE_YUBIKEY_PRELOAD:-true}" != "true" ]; then
    return
  fi

  if ! command -v ssh-add >/dev/null 2>&1; then
    return
  fi

  if [ ! -t 0 ]; then
    return
  fi

  if ! ssh-add -L >/dev/null 2>&1; then
    eval "$(ssh-agent -s)" >/dev/null
  fi

  local provider
  provider="$(detect_pkcs11_provider)"
  if [ -z "${provider}" ] || [ ! -f "${provider}" ]; then
    return
  fi

  if ssh-add -L 2>/dev/null | grep -qi "PIV Authentication"; then
    return
  fi

  echo "YubiKey detected: loading PKCS#11 key into ssh-agent (PIN may be requested)..."
  if ! ssh-add -s "${provider}" < /dev/tty; then
    echo "Warning: failed to preload YubiKey key. Continuing without preload."
  fi
}

usage() {
  cat <<EOF
Usage:
  tools/ansible/run_prod_private.sh [options]

Options:
  --menu                 Интерактивный выбор playbook (site/master/workers)
  --playbook <value>     site | master | workers | /abs/path/to/playbook.yml
  --check                Запуск ansible в dry-run режиме (--check)
  -h, --help             Показать помощь
EOF
}

resolve_playbook() {
  local value="$1"
  case "${value}" in
    site) echo "${ROOT_DIR}/ansible/playbooks/site.yml" ;;
    master) echo "${ROOT_DIR}/ansible/playbooks/master.yml" ;;
    workers) echo "${ROOT_DIR}/ansible/playbooks/workers.yml" ;;
    *) echo "${value}" ;;
  esac
}

choose_playbook_menu() {
  local choice
  echo "Выбери playbook:"
  echo "  1) site"
  echo "  2) master"
  echo "  3) workers"
  read -r -p "Введите номер [1-3, default: 1]: " choice
  choice="${choice:-1}"
  case "${choice}" in
    1) PLAYBOOK_PATH="${ROOT_DIR}/ansible/playbooks/site.yml" ;;
    2) PLAYBOOK_PATH="${ROOT_DIR}/ansible/playbooks/master.yml" ;;
    3) PLAYBOOK_PATH="${ROOT_DIR}/ansible/playbooks/workers.yml" ;;
    *) echo "Некорректный выбор: ${choice}"; exit 1 ;;
  esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --menu)
      MENU_MODE=true
      shift
      ;;
    --check)
      CHECK_MODE=true
      shift
      ;;
    --playbook)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --playbook"
        exit 1
      fi
      PLAYBOOK_PATH="$(resolve_playbook "$2")"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      # Backward compatibility: positional playbook path/name
      PLAYBOOK_PATH="$(resolve_playbook "$1")"
      shift
      ;;
  esac
done

if [ "${MENU_MODE}" = "true" ]; then
  choose_playbook_menu
fi

if ! command -v ansible-playbook >/dev/null 2>&1; then
  echo "ansible-playbook not found. Install Ansible first."
  exit 1
fi

if [ ! -f "${INVENTORY_PATH}" ]; then
  echo "Private inventory not found: ${INVENTORY_PATH}"
  echo "Run tools/ansible/bootstrap_private_vars.sh first."
  exit 1
fi

if [ ! -f "${PLAYBOOK_PATH}" ]; then
  echo "Playbook not found: ${PLAYBOOK_PATH}"
  exit 1
fi

if [ -z "${ANSIBLE_CONFIG:-}" ] && [ -f "${ANSIBLE_CONFIG_DEFAULT}" ]; then
  export ANSIBLE_CONFIG="${ANSIBLE_CONFIG_DEFAULT}"
fi

preload_yubikey_key

mkdir -p "${LOCAL_TMP_DEFAULT}"

if [ -z "${ANSIBLE_LOCAL_TEMP:-}" ]; then
  export ANSIBLE_LOCAL_TEMP="${LOCAL_TMP_DEFAULT}"
fi

if [ -z "${ANSIBLE_ROLES_PATH:-}" ]; then
  export ANSIBLE_ROLES_PATH="${ROLES_PATH_DEFAULT}"
else
  export ANSIBLE_ROLES_PATH="${ROLES_PATH_DEFAULT}:${ANSIBLE_ROLES_PATH}"
fi

cmd=(ansible-playbook -i "${INVENTORY_PATH}" "${PLAYBOOK_PATH}")

if [ -z "${ANSIBLE_FORKS:-}" ]; then
  ANSIBLE_FORKS=1
fi
cmd+=(--forks "${ANSIBLE_FORKS}")

if [ -z "${ANSIBLE_RUN_SSH_COMMON_ARGS:-}" ]; then
  ANSIBLE_RUN_SSH_COMMON_ARGS="${SSH_COMMON_ARGS_DEFAULT}"
fi

if [ -n "${ANSIBLE_RUN_SSH_COMMON_ARGS}" ]; then
  cmd+=(--ssh-common-args "${ANSIBLE_RUN_SSH_COMMON_ARGS}")
fi

if [ "${CHECK_MODE}" = "true" ]; then
  cmd+=(--check)
fi

echo "Running: ${cmd[*]}"
"${cmd[@]}"
