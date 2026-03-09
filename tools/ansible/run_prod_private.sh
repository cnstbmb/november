#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY_PATH="${ROOT_DIR}/.private/ansible/prod/hosts.yml"
PLAYBOOK_PATH="${ROOT_DIR}/ansible/playbooks/site.yml"
CHECK_MODE=false
MENU_MODE=false

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

cmd=(ansible-playbook -i "${INVENTORY_PATH}" "${PLAYBOOK_PATH}")
if [ "${CHECK_MODE}" = "true" ]; then
  cmd+=(--check)
fi

echo "Running: ${cmd[*]}"
"${cmd[@]}"
