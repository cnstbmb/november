#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INVENTORY="${REPO_ROOT}/.private/ansible/prod/hosts.yml"
PLAYBOOK="${REPO_ROOT}/infra/ansible/playbooks/home-ai.yml"
INVENTORY_HOST="${HOME_AI_INVENTORY_HOST:-home.himenkov.ru}"
LAN_HOST="${HOME_AI_LAN_HOST:-192.168.1.164}"
CONTROL_PATH="${HOME_AI_SSH_CONTROL_PATH:-/Users/konstantin/.ssh/S.cnstbmb@192.168.1.164:22}"
SSH_USER="${HOME_AI_SSH_USER:-cnstbmb}"

if [[ ! -S "${CONTROL_PATH}" ]]; then
  printf 'SSH ControlSocket not found: %s\n' "${CONTROL_PATH}" >&2
  exit 1
fi

"${SCRIPT_DIR}/configure_secrets.sh" --check

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/home-ai-deploy.XXXXXX")"
PASSWORD_FILE="${TEMP_DIR}/become-password"
trap 'rm -rf "${TEMP_DIR:-}"; stty echo 2>/dev/null || true' EXIT

printf 'NanoPi sudo password (скрыт, хранится только во временном mode=0600 файле): ' >&2
stty -echo
IFS= read -r become_password
stty echo
printf '\n' >&2
if [[ -z "${become_password}" ]]; then
  printf 'Пароль не может быть пустым.\n' >&2
  exit 1
fi
printf '%s\n' "${become_password}" > "${PASSWORD_FILE}"
chmod 0600 "${PASSWORD_FILE}"
unset become_password

COMMON_ARGS=(
  -i "${INVENTORY}"
  "${PLAYBOOK}"
  --limit "${INVENTORY_HOST}"
  --forks 1
  -e "ansible_host=${LAN_HOST}"
  --ssh-common-args "-o ControlPath=${CONTROL_PATH} -o BatchMode=yes"
  --become-password-file "${PASSWORD_FILE}"
)

export ANSIBLE_ROLES_PATH="${REPO_ROOT}/infra/ansible/roles"
export ANSIBLE_LOCAL_TEMP="${TMPDIR:-/tmp}/ansible-home-ai-local"

printf '\n[1/2] Ansible dry-run against %s\n' "${LAN_HOST}"
ansible-playbook "${COMMON_ARGS[@]}" --check

printf '\nDry-run завершён. Для применения введи DEPLOY: '
IFS= read -r confirmation
if [[ "${confirmation}" != "DEPLOY" ]]; then
  printf 'Apply отменён; изменений не внесено.\n'
  exit 0
fi

printf '\n[2/2] Applying home AI deployment\n'
printf 'Stopping the temporary RKLLM smoke stack (model files are preserved).\n'
ssh -o "ControlPath=${CONTROL_PATH}" -o BatchMode=yes "${SSH_USER}@${LAN_HOST}" \
  "cd /home/cnstbmb/home-ai-runtime && docker compose --project-name home-ai-rkllm-smoke down --remove-orphans"
ansible-playbook "${COMMON_ARGS[@]}"
printf '\nDeployment completed. Password file removed.\n'
