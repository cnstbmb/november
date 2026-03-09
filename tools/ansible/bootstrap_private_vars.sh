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

echo "=== Bootstrap private Ansible vars (.private/ansible/prod) ==="

prompt master_host "IP/hostname master"
prompt worker_hosts_csv "IP/hostname workers (через запятую, можно пусто)" ""
prompt ansible_user "SSH user" "root"
prompt ansible_port "SSH port" "22"
prompt ssh_public_key_path "Путь к публичному SSH ключу на control-node" "${HOME}/.ssh/id_ed25519.pub"
prompt timezone "Timezone" "Europe/Moscow"
prompt swap_size_mb "Swap size MB" "2048"
prompt compose_project_name "Docker compose project name" "november"
prompt compose_src "Локальный путь к compose файлу на control-node" "${ROOT_DIR}/deployments/prod/docker-compose.yml"
prompt compose_dest_dir "Директория на target хосте для compose" "/opt/november"
prompt compose_dest_file "Полный путь docker-compose.yml на target" "/opt/november/docker-compose.yml"
prompt env_src "Локальный путь к .env (пусто если не копировать)" ""
prompt env_dest "Путь .env на target (пусто если не копировать)" ""
prompt docker_users_csv "Пользователи для docker group (через запятую)" "${ansible_user}"

worker_count=0
declare -a worker_hosts=()
if [ -n "${worker_hosts_csv}" ]; then
  IFS=',' read -r -a worker_hosts <<< "${worker_hosts_csv}"
  for host in "${worker_hosts[@]}"; do
    host_trimmed="$(echo "${host}" | xargs)"
    [ -z "${host_trimmed}" ] && continue
    worker_count=$((worker_count + 1))
  done
fi

if [ "${worker_count}" -gt 0 ]; then
  prompt_bool enable_remnawave_node "Включить deploy remnawave_node на workers?" "true"
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
prompt_bool enable_remnashop "Включить remnashop на master?" "true"

if [ "${enable_monitoring}" = "true" ]; then
  prompt monitoring_dir "Путь monitoring dir" "/opt/monitoring"
  prompt monitoring_prometheus_port "Prometheus port" "9090"
  prompt monitoring_grafana_port "Grafana port" "3000"
  prompt monitoring_loki_port "Loki port" "3100"
  prompt monitoring_grafana_admin_user "Grafana admin user" "admin"
  prompt_secret monitoring_grafana_admin_password "Grafana admin password"
fi

if [ "${enable_backups}" = "true" ]; then
  prompt backup_target "Backup target (например s3://bucket/path или /mnt/backup/november)" "/mnt/backup/november"
  prompt_secret backup_password "Backup password (restic)"
  prompt backup_paths_csv "Backup paths (через запятую)" "/srv/pg-data,/srv/logs,/etc"
  prompt backup_exclude_csv "Backup exclude (через запятую, можно пусто)" ""
  prompt backup_keep_daily "Keep daily" "7"
  prompt backup_keep_weekly "Keep weekly" "4"
  prompt backup_keep_monthly "Keep monthly" "3"
  prompt backup_cron_hour "Backup cron hour" "2"
  prompt backup_cron_minute "Backup cron minute" "0"
fi

cat > "${PRIVATE_DIR}/hosts.yml" <<EOF
all:
  children:
    master:
      hosts:
        ${master_host}: {}
    workers:
      hosts:
EOF

if [ "${worker_count}" -gt 0 ]; then
  for host in "${worker_hosts[@]}"; do
    host_trimmed="$(echo "${host}" | xargs)"
    [ -z "${host_trimmed}" ] && continue
    cat >> "${PRIVATE_DIR}/hosts.yml" <<EOF
        ${host_trimmed}: {}
EOF
  done
fi

monitoring_targets_yaml=$'\n  - "localhost:9100"'
if [ "${worker_count}" -gt 0 ]; then
  for host in "${worker_hosts[@]}"; do
    host_trimmed="$(echo "${host}" | xargs)"
    [ -z "${host_trimmed}" ] && continue
    monitoring_targets_yaml="${monitoring_targets_yaml}
  - \"${host_trimmed}:9100\""
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
EOF

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
