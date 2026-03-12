#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIVATE_DIR="${ROOT_DIR}/.private/ansible/prod"
GROUP_VARS_DIR="${PRIVATE_DIR}/group_vars"

mkdir -p "${GROUP_VARS_DIR}"

prompt() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-}"
  local value

  if [ -n "${default_value}" ]; then
    read -r -p "${message} [${default_value}]: " value
    value="${value:-${default_value}}"
  else
    read -r -p "${message}: " value
  fi

  printf -v "${var_name}" "%s" "${value}"
}

prompt_secret() {
  local var_name="$1"
  local message="$2"
  local value

  read -r -s -p "${message}: " value
  echo
  printf -v "${var_name}" "%s" "${value}"
}

prompt_bool() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-false}"
  local value

  while true; do
    read -r -p "${message} [y/n, default: ${default_value}]: " value
    value="${value:-${default_value}}"
    case "${value}" in
      y|Y|yes|YES|true|TRUE|1) printf -v "${var_name}" "true"; return ;;
      n|N|no|NO|false|FALSE|0) printf -v "${var_name}" "false"; return ;;
      *) echo "Введите y или n." ;;
    esac
  done
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(16))
PY
    return
  fi

  echo "change_me"
}

parse_host_entry() {
  local raw="$1"
  local trimmed name target

  trimmed="$(echo "${raw}" | xargs)"
  if [ -z "${trimmed}" ]; then
    return 1
  fi

  if [[ "${trimmed}" == *=* ]]; then
    name="$(echo "${trimmed%%=*}" | xargs)"
    target="$(echo "${trimmed#*=}" | xargs)"
  else
    name="${trimmed}"
    target="${trimmed}"
  fi

  if [ -z "${name}" ] || [ -z "${target}" ]; then
    return 1
  fi

  PARSED_HOST_NAME="${name}"
  PARSED_HOST_TARGET="${target}"
  return 0
}

append_host_inventory_entry() {
  local file="$1"
  local host_name="$2"
  local host_target="$3"
  local host_user="$4"
  local host_port="$5"

  if [ "${host_name}" = "${host_target}" ] && [ -z "${host_user}" ] && [ -z "${host_port}" ]; then
    cat >> "${file}" <<EOF
        ${host_name}: {}
EOF
    return
  fi

  cat >> "${file}" <<EOF
        ${host_name}:
EOF

  if [ "${host_name}" != "${host_target}" ]; then
    cat >> "${file}" <<EOF
          ansible_host: "${host_target}"
EOF
  fi

  if [ -n "${host_user}" ]; then
    cat >> "${file}" <<EOF
          ansible_user: "${host_user}"
EOF
  fi

  if [ -n "${host_port}" ]; then
    cat >> "${file}" <<EOF
          ansible_port: ${host_port}
EOF
  fi
}

echo "=== Bootstrap private Ansible vars (.private/ansible/prod) ==="

default_ssh_public_key_path="${HOME}/.ssh/id_ed25519.pub"
for candidate in "${HOME}/.ssh/yubikey_9a.pub" "${HOME}/.ssh/id_ed25519.pub" "${HOME}/.ssh/id_rsa.pub"; do
  if [ -f "${candidate}" ]; then
    default_ssh_public_key_path="${candidate}"
    break
  fi
done

prompt master_entry "Master host (name или name=ip)"
prompt worker_hosts_csv "Workers (name или name=ip, через запятую, можно пусто)" ""
prompt ansible_user "SSH user" "root"
prompt ansible_port "SSH port" "22"
prompt ssh_public_key_path "Путь к публичному SSH ключу на control-node" "${default_ssh_public_key_path}"
if [ ! -f "${ssh_public_key_path}" ]; then
  echo "SSH public key file not found: ${ssh_public_key_path}"
  exit 1
fi
prompt timezone "Timezone" "Europe/Moscow"
prompt swap_size_mb "Swap size MB" "2048"
prompt compose_project_name "Docker compose project name" "november"
prompt compose_src "Локальный путь к compose файлу на control-node" "${ROOT_DIR}/deployments/prod/docker-compose.yml"
prompt compose_dest_dir "Директория на target хосте для compose" "/opt/november"
prompt compose_dest_file "Полный путь docker-compose.yml на target" "/opt/november/docker-compose.yml"
default_env_src=""
if [ -f "${ROOT_DIR}/deployments/prod/database.env" ]; then
  default_env_src="${ROOT_DIR}/deployments/prod/database.env"
fi
prompt env_src "Локальный путь к .env (пусто если не копировать)" "${default_env_src}"
prompt env_dest "Путь .env на target (пусто если не копировать)" "/opt/november/database.env"
prompt docker_users_csv "Пользователи для docker group (через запятую)" "${ansible_user}"

if ! parse_host_entry "${master_entry}"; then
  echo "Некорректный master host: ${master_entry}"
  echo "Используй формат: name или name=ip"
  exit 1
fi
master_host_name="${PARSED_HOST_NAME}"
master_host_target="${PARSED_HOST_TARGET}"

worker_count=0
declare -a worker_hosts=()
declare -a worker_targets=()
declare -a worker_user_overrides=()
declare -a worker_port_overrides=()
if [ -n "${worker_hosts_csv}" ]; then
  IFS=',' read -r -a worker_entries <<< "${worker_hosts_csv}"
  for entry in "${worker_entries[@]}"; do
    if ! parse_host_entry "${entry}"; then
      echo "Некорректный worker host: ${entry}"
      echo "Используй формат: name или name=ip"
      exit 1
    fi
    worker_hosts+=("${PARSED_HOST_NAME}")
    worker_targets+=("${PARSED_HOST_TARGET}")
    worker_count=$((worker_count + 1))
  done
fi

prompt master_ansible_user_override "SSH user для master ${master_host_name} (пусто = ${ansible_user})" ""
prompt master_ansible_port_override "SSH port для master ${master_host_name} (пусто = ${ansible_port})" ""

if [ "${master_ansible_user_override}" = "${ansible_user}" ]; then
  master_ansible_user_override=""
fi
if [ "${master_ansible_port_override}" = "${ansible_port}" ]; then
  master_ansible_port_override=""
fi

if [ "${worker_count}" -gt 0 ]; then
  for i in "${!worker_hosts[@]}"; do
    worker_name="${worker_hosts[$i]}"
    prompt worker_ansible_user_override "SSH user для worker ${worker_name} (пусто = ${ansible_user})" ""
    prompt worker_ansible_port_override "SSH port для worker ${worker_name} (пусто = ${ansible_port})" ""

    if [ "${worker_ansible_user_override}" = "${ansible_user}" ]; then
      worker_ansible_user_override=""
    fi
    if [ "${worker_ansible_port_override}" = "${ansible_port}" ]; then
      worker_ansible_port_override=""
    fi

    worker_user_overrides+=("${worker_ansible_user_override}")
    worker_port_overrides+=("${worker_ansible_port_override}")
  done
fi

if [ "${worker_count}" -gt 0 ]; then
  prompt_bool enable_remnawave_node "Включить deploy remnawave_node на workers?" "false"
else
  enable_remnawave_node="false"
fi

if [ "${enable_remnawave_node}" = "true" ]; then
  prompt node_compose_src "Локальный путь к worker compose файлу" "${ROOT_DIR}/deployments/prod/remnawave-node/docker-compose.yml"
  prompt node_compose_dest_dir "Директория worker compose на target" "/opt/remnawave-node"
  prompt node_compose_dest_file "Полный путь worker docker-compose.yml на target" "/opt/remnawave-node/docker-compose.yml"
  prompt node_env_src "Локальный путь к worker .env (пусто если не копировать)" ""
  prompt node_env_dest "Путь worker .env на target (пусто если не копировать)" "/opt/remnawave-node/.env"
fi

prompt_bool enable_monitoring "Включить monitoring на master?" "true"
prompt_bool enable_backups "Включить backups на master?" "true"
prompt_bool enable_adguard "Включить AdGuard на master?" "true"
prompt_bool enable_remnashop "Установить remnashop (бот/магазин) на master?" "false"

adguard_web_port=""
if [ "${enable_adguard}" = "true" ]; then
  default_adguard_web_port="3000"
  if [ "${enable_monitoring}" = "true" ]; then
    default_adguard_web_port="3001"
  fi
  prompt adguard_web_port "Порт AdGuard Web UI на host" "${default_adguard_web_port}"
fi

if [ "${enable_remnashop}" = "true" ]; then
  prompt remnashop_env_src "Локальный путь к remnashop .env" "${PRIVATE_DIR}/remnashop/.env"
  prompt remnashop_env_dest "Путь remnashop .env на target" "/opt/remnashop/.env"
  prompt_bool remnashop_validate_env "Проверять remnashop .env на placeholder 'change_me'?" "true"
else
  remnashop_env_src=""
  remnashop_env_dest="/opt/remnashop/.env"
  remnashop_validate_env="false"
fi

if [ "${enable_remnashop}" = "true" ] && [ -n "${remnashop_env_src}" ]; then
  mkdir -p "$(dirname "${remnashop_env_src}")"
  if [ ! -f "${remnashop_env_src}" ]; then
    remnashop_db_password="$(generate_secret)"
    remnashop_redis_password="$(generate_secret)"
    cat > "${remnashop_env_src}" <<EOF
# Generated by tools/ansible/bootstrap_private_vars.sh
# Fill required remnashop variables with production values.
# Keep this file private.
DATABASE_USER=remnashop
DATABASE_PASSWORD=${remnashop_db_password}
DATABASE_NAME=remnashop
REDIS_PASSWORD=${remnashop_redis_password}
EOF
    chmod 600 "${remnashop_env_src}"
    echo "Created default remnashop env file: ${remnashop_env_src}"
  fi
fi

if [ "${enable_monitoring}" = "true" ]; then
  prompt monitoring_dir "Путь monitoring dir" "/opt/monitoring"
  prompt monitoring_prometheus_port "Prometheus port" "9090"
  prompt monitoring_grafana_port "Grafana port" "3000"
  prompt monitoring_loki_port "Loki port" "3100"
  prompt monitoring_grafana_admin_user "Grafana admin user" "admin"
  prompt_secret monitoring_grafana_admin_password "Grafana admin password"
fi

if [ "${enable_backups}" = "true" ]; then
  prompt backup_target "Backup target (например s3:https://endpoint/bucket или /mnt/backup/november)" "/mnt/backup/november"
  prompt_secret backup_password "Backup password (restic)"
  prompt backup_paths_csv "Backup paths (через запятую)" "/srv/pg-data,/srv/logs,/etc"
  prompt backup_exclude_csv "Backup exclude (через запятую, можно пусто)" ""
  prompt backup_keep_daily "Keep daily" "7"
  prompt backup_keep_weekly "Keep weekly" "4"
  prompt backup_keep_monthly "Keep monthly" "3"
  prompt backup_cron_hour "Backup cron hour" "2"
  prompt backup_cron_minute "Backup cron minute" "0"

  backup_use_s3_default="false"
  if [[ "${backup_target}" == s3:* ]]; then
    backup_use_s3_default="true"
  fi
  prompt_bool backup_use_s3 "Использовать S3 credentials (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)?" "${backup_use_s3_default}"

  if [ "${backup_use_s3}" = "true" ] && [[ "${backup_target}" == https://* || "${backup_target}" == http://* ]]; then
    backup_target="s3:${backup_target}"
    echo "Converted backup_target to restic S3 format: ${backup_target}"
  fi

  backup_s3_access_key_id=""
  backup_s3_secret_access_key=""
  backup_s3_region=""
  if [ "${backup_use_s3}" = "true" ]; then
    prompt backup_s3_access_key_id "S3 AWS_ACCESS_KEY_ID"
    prompt_secret backup_s3_secret_access_key "S3 AWS_SECRET_ACCESS_KEY"
    prompt backup_s3_region "S3 AWS_DEFAULT_REGION (можно пусто)" ""
  fi
fi

cat > "${PRIVATE_DIR}/hosts.yml" <<EOF
all:
  children:
    master:
      hosts:
EOF

append_host_inventory_entry \
  "${PRIVATE_DIR}/hosts.yml" \
  "${master_host_name}" \
  "${master_host_target}" \
  "${master_ansible_user_override}" \
  "${master_ansible_port_override}"

cat >> "${PRIVATE_DIR}/hosts.yml" <<EOF
    workers:
      hosts:
EOF

if [ "${worker_count}" -gt 0 ]; then
  for i in "${!worker_hosts[@]}"; do
    host_name="${worker_hosts[$i]}"
    host_target="${worker_targets[$i]}"
    host_user="${worker_user_overrides[$i]}"
    host_port="${worker_port_overrides[$i]}"
    append_host_inventory_entry \
      "${PRIVATE_DIR}/hosts.yml" \
      "${host_name}" \
      "${host_target}" \
      "${host_user}" \
      "${host_port}"
  done
fi

monitoring_targets_yaml=$'\n  - "localhost:9100"'
if [ "${worker_count}" -gt 0 ]; then
  for host_target in "${worker_targets[@]}"; do
    monitoring_targets_yaml="${monitoring_targets_yaml}
  - \"${host_target}:9100\""
  done
fi

docker_users_yaml=""
IFS=',' read -r -a docker_users <<< "${docker_users_csv}"
for user in "${docker_users[@]}"; do
  user_trimmed="$(echo "${user}" | xargs)"
  [ -z "${user_trimmed}" ] && continue
  docker_users_yaml="${docker_users_yaml}
  - \"${user_trimmed}\""
done
if [ -z "${docker_users_yaml}" ]; then
  docker_users_yaml=$'\n  - "'"${ansible_user}"'"'
fi

cat > "${GROUP_VARS_DIR}/all.yml" <<EOF
ansible_user: "${ansible_user}"
ansible_port: ${ansible_port}
ssh_public_key_path: "${ssh_public_key_path}"

timezone: "${timezone}"
swap_size_mb: ${swap_size_mb}

install_docker: true
docker_users:${docker_users_yaml}
docker_configure_log_rotation: true
docker_log_driver: "json-file"
docker_log_max_size: "10m"
docker_log_max_file: "5"

repo_root: "${ROOT_DIR}"
compose_project_name: "${compose_project_name}"
compose_src: "${compose_src}"
compose_dest_dir: "${compose_dest_dir}"
compose_dest_file: "${compose_dest_file}"

env_src: "${env_src}"
env_dest: "${env_dest}"

allow_http_https: false

enable_nginx: false
enable_certbot: false
letsencrypt_email: ""
panel_domain: ""
remnawave_upstream_port: 8080
cloudflare_api_token: ""
certbot_credentials_path: "/etc/letsencrypt/cloudflare.ini"

enable_monitoring: false
enable_backups: false
monitoring_dir: "/opt/monitoring"
monitoring_prometheus_port: 9090
monitoring_grafana_port: 3000
monitoring_loki_port: 3100
monitoring_grafana_admin_user: "admin"
monitoring_grafana_admin_password: ""
monitoring_node_targets:${monitoring_targets_yaml}

backup_target: "/mnt/backup/november"
backup_password: ""
backup_paths: []
backup_exclude: []
backup_keep_daily: 7
backup_keep_weekly: 4
backup_keep_monthly: 3
backup_cron_minute: "0"
backup_cron_hour: "2"
backup_cron_day: "*"
backup_cron_month: "*"
backup_cron_weekday: "*"
backup_require_external_target: true
EOF

cat > "${GROUP_VARS_DIR}/master.yml" <<EOF
allow_http_https: true
enable_nginx: false
enable_certbot: false
enable_monitoring: ${enable_monitoring}
enable_backups: ${enable_backups}
enable_adguard: ${enable_adguard}
enable_remnashop: ${enable_remnashop}
remnashop_dir: "/opt/remnashop"
remnashop_mode: "internal"
remnashop_env_src: "${remnashop_env_src}"
remnashop_env_dest: "${remnashop_env_dest}"
remnashop_validate_env: ${remnashop_validate_env}
EOF

if [ "${enable_adguard}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
adguard_web_port: ${adguard_web_port}
EOF
fi

if [ "${enable_monitoring}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
monitoring_dir: "${monitoring_dir}"
monitoring_prometheus_port: ${monitoring_prometheus_port}
monitoring_grafana_port: ${monitoring_grafana_port}
monitoring_loki_port: ${monitoring_loki_port}
monitoring_grafana_admin_user: "${monitoring_grafana_admin_user}"
monitoring_grafana_admin_password: "${monitoring_grafana_admin_password}"
monitoring_prometheus_retention: "7d"
monitoring_loki_retention: "168h"
EOF
fi

if [ "${enable_backups}" = "true" ]; then
  backup_paths_yaml=""
  IFS=',' read -r -a backup_paths_array <<< "${backup_paths_csv}"
  for path in "${backup_paths_array[@]}"; do
    path_trimmed="$(echo "${path}" | xargs)"
    [ -z "${path_trimmed}" ] && continue
    backup_paths_yaml="${backup_paths_yaml}
  - \"${path_trimmed}\""
  done

  backup_exclude_yaml=""
  if [ -n "${backup_exclude_csv}" ]; then
    IFS=',' read -r -a backup_exclude_array <<< "${backup_exclude_csv}"
    for path in "${backup_exclude_array[@]}"; do
      path_trimmed="$(echo "${path}" | xargs)"
      [ -z "${path_trimmed}" ] && continue
      backup_exclude_yaml="${backup_exclude_yaml}
  - \"${path_trimmed}\""
    done
  fi
  if [ -z "${backup_paths_yaml}" ]; then
    backup_paths_yaml=" []"
  fi
  if [ -z "${backup_exclude_yaml}" ]; then
    backup_exclude_yaml=" []"
  fi

  cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
backup_target: "${backup_target}"
backup_password: "${backup_password}"
backup_paths:${backup_paths_yaml}
backup_exclude:${backup_exclude_yaml}
backup_keep_daily: ${backup_keep_daily}
backup_keep_weekly: ${backup_keep_weekly}
backup_keep_monthly: ${backup_keep_monthly}
backup_cron_minute: "${backup_cron_minute}"
backup_cron_hour: "${backup_cron_hour}"
backup_cron_day: "*"
backup_cron_month: "*"
backup_cron_weekday: "*"
EOF

  if [ "${backup_use_s3}" = "true" ]; then
    cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
backup_env:
  AWS_ACCESS_KEY_ID: "${backup_s3_access_key_id}"
  AWS_SECRET_ACCESS_KEY: "${backup_s3_secret_access_key}"
EOF
    if [ -n "${backup_s3_region}" ]; then
      cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
  AWS_DEFAULT_REGION: "${backup_s3_region}"
EOF
    fi
  fi
fi

cat > "${GROUP_VARS_DIR}/workers.yml" <<EOF
enable_remnawave_node: ${enable_remnawave_node}
EOF

if [ "${enable_remnawave_node}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/workers.yml" <<EOF
node_compose_src: "${node_compose_src}"
node_compose_dest_dir: "${node_compose_dest_dir}"
node_compose_dest_file: "${node_compose_dest_file}"
node_env_src: "${node_env_src}"
node_env_dest: "${node_env_dest}"
EOF
fi

echo
echo "Private inventory/vars created:"
echo "  ${PRIVATE_DIR}/hosts.yml"
echo "  ${GROUP_VARS_DIR}/all.yml"
echo "  ${GROUP_VARS_DIR}/master.yml"
echo "  ${GROUP_VARS_DIR}/workers.yml"
echo
echo "Run:"
echo "  tools/ansible/run_prod_private.sh"

if [ "${enable_remnawave_node}" = "true" ] && [ -z "${node_env_src:-}" ]; then
  echo
  echo "remnawave_node is enabled, but node_env_src is empty."
  echo "Before ansible run, generate worker env files:"
  echo "  tools/ansible/bootstrap_remnawave_node_env.sh"
fi

if [ "${enable_remnashop}" = "true" ] && [ -z "${remnashop_env_src:-}" ]; then
  echo
  echo "remnashop is enabled, but remnashop_env_src is empty."
  echo "Ansible will keep downloaded .env.example on target and validation may fail on 'change_me'."
  echo "Set a private remnashop_env_src in:"
  echo "  ${GROUP_VARS_DIR}/master.yml"
fi
