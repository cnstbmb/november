#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
inventory="${repo_root}/.private/ansible/prod/hosts.yml"
playbook="${repo_root}/infra/ansible/playbooks/secondbrain.yml"
inventory_host="home.himenkov.ru"
lan_host="192.168.1.164"
control_path="/Users/konstantin/.ssh/S.cnstbmb@192.168.1.164:22"

if [[ ! -S "${control_path}" ]]; then
  osascript -e 'display alert "SecondBrain deploy" message "SSH ControlSocket не найден. Сначала прогрей SSH к NanoPi." as critical'
  exit 1
fi

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/secondbrain-deploy.XXXXXX")"
password_file="${temporary_dir}/become-password"
cleanup() {
  rm -rf -- "${temporary_dir}"
}
trap cleanup EXIT

if ! become_password="$(osascript -e 'text returned of (display dialog "Пароль sudo для NanoPi" default answer "" with hidden answer buttons {"Cancel", "Deploy"} default button "Deploy" with icon caution)')"; then
  exit 1
fi
if [[ -z "${become_password}" ]]; then
  osascript -e 'display alert "SecondBrain deploy" message "Пустой sudo-пароль не принят." as critical'
  exit 1
fi
printf '%s\n' "${become_password}" >"${password_file}"
chmod 0600 "${password_file}"
unset become_password

export ANSIBLE_ROLES_PATH="${repo_root}/infra/ansible/roles"
export ANSIBLE_LOCAL_TEMP="${temporary_dir}/ansible-local"

ansible-playbook \
  -i "${inventory}" \
  "${playbook}" \
  --limit "${inventory_host}" \
  --forks 1 \
  -e "ansible_host=${lan_host}" \
  --ssh-common-args "-o ControlPath=${control_path} -o BatchMode=yes" \
  --become-password-file "${password_file}"

osascript -e 'display notification "Ansible deployment завершён" with title "SecondBrain"'
