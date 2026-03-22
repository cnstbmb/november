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

trim_whitespace() {
  local value="$1"

  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

normalize_bearer_token() {
  local value
  value="$(trim_whitespace "${1//$'\r'/}")"
  case "${value}" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  if [[ "${value}" =~ ^[Aa]uthorization:[[:space:]]*[Bb]earer[[:space:]]+(.+)$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "${value}" =~ ^[Aa]uthorization:[[:space:]]+(.+)$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  case "${value}" in
    [Bb]earer\ *) value="$(trim_whitespace "${value#* }")" ;;
  esac
  case "${value}" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$(trim_whitespace "${value}")"
}

validate_cloudflare_token() {
  local value="$1"

  if [ -z "${value}" ]; then
    echo "Cloudflare API token is empty."
    return 1
  fi

  if [[ "${value}" =~ [[:space:]] ]]; then
    echo "Cloudflare API token contains whitespace."
    echo "Paste raw token value from Cloudflare dashboard, without Authorization header or Bearer prefix."
    return 1
  fi

  if [[ "${value}" == *:* ]]; then
    echo "Cloudflare API token still contains ':' after normalization."
    echo "Paste raw token value from Cloudflare dashboard, not a full Authorization header."
    return 1
  fi

  if [[ "${value}" =~ ^[Aa]uthorization$|^[Bb]earer$ ]]; then
    echo "Cloudflare API token is incomplete."
    echo "Paste raw token value from Cloudflare dashboard."
    return 1
  fi

  return 0
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

generate_secret_64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return
  fi

  printf '%064s\n' "change_me" | tr ' ' '0'
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

default_certbot_domain_for_host() {
  local host_name="$1"
  if [[ "${host_name}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || [[ "${host_name}" == *:* ]]; then
    echo ""
  else
    echo "${host_name}"
  fi
}

cloudflare_upsert_dns_records() {
  local cloudflare_token="$1"
  shift
  python3 - "${cloudflare_token}" "$@" <<'PY'
import ipaddress
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

token = sys.argv[1]
token = token.strip()
if token.lower().startswith("bearer "):
    token = token[7:].strip()
pairs = sys.argv[2:]
if len(pairs) % 2 != 0:
    raise SystemExit("Internal error: invalid host/ip pairs for Cloudflare DNS sync")

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}
base_url = "https://api.cloudflare.com/client/v4"


def api(method, path, query=None, payload=None):
    url = base_url + path
    if query:
        url += "?" + urllib.parse.urlencode(query)

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Cloudflare HTTP {exc.code} {method} {path}: {body}") from exc

    parsed = json.loads(body)
    if not parsed.get("success"):
        errors = "; ".join(err.get("message", "unknown error") for err in parsed.get("errors", []))
        raise RuntimeError(f"Cloudflare API {method} {path} failed: {errors}")
    return parsed.get("result", [])


def find_zone_id(hostname):
    labels = hostname.split(".")
    if len(labels) < 2:
        raise RuntimeError(f"Host '{hostname}' is not a valid FQDN for Cloudflare zone lookup")

    # Try progressively shorter suffixes: a.b.c.tld -> a.b.c.tld, b.c.tld, c.tld
    for idx in range(0, len(labels) - 1):
        candidate = ".".join(labels[idx:])
        if candidate.count(".") < 1:
            continue
        zones = api("GET", "/zones", {
            "name": candidate,
            "status": "active",
            "match": "all",
            "per_page": "1",
        })
        if zones and zones[0].get("name") == candidate:
            return zones[0]["id"], candidate

    raise RuntimeError(f"Cloudflare zone not found for host '{hostname}'")


try:
    for i in range(0, len(pairs), 2):
        hostname = pairs[i].strip().lower()
        target_ip = pairs[i + 1].strip()
        try:
            ipaddress.ip_address(target_ip)
        except ValueError as exc:
            raise RuntimeError(
                f"Cannot create DNS record for '{hostname}': target '{target_ip}' is not an IP. "
                "Use host format name=ip in bootstrap."
            ) from exc

        record_type = "AAAA" if ":" in target_ip else "A"
        zone_id, zone_name = find_zone_id(hostname)

        records = api("GET", f"/zones/{zone_id}/dns_records", {
            "type": record_type,
            "name": hostname,
            "per_page": "1",
        })

        payload = {
            "type": record_type,
            "name": hostname,
            "content": target_ip,
            "ttl": 1,
            "proxied": False,
        }

        if records:
            record = records[0]
            record_id = record.get("id")
            if (
                record.get("type") == record_type
                and record.get("content") == target_ip
                and record.get("proxied") is False
            ):
                print(f"[cloudflare] OK   {hostname} -> {target_ip} ({record_type}, zone {zone_name})")
                continue

            api("PATCH", f"/zones/{zone_id}/dns_records/{record_id}", payload=payload)
            print(f"[cloudflare] UPD  {hostname} -> {target_ip} ({record_type}, zone {zone_name})")
        else:
            api("POST", f"/zones/{zone_id}/dns_records", payload=payload)
            print(f"[cloudflare] ADD  {hostname} -> {target_ip} ({record_type}, zone {zone_name})")
except Exception as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(1)
PY
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

prompt_bool enable_certbot "Включить certbot (Cloudflare DNS-01) на всех хостах?" "true"
certbot_install="true"
certbot_credentials_path="/etc/letsencrypt/cloudflare.ini"
letsencrypt_email=""
cloudflare_api_token=""
cloudflare_manage_dns="false"
master_certbot_domain="$(default_certbot_domain_for_host "${master_host_name}")"
declare -a worker_certbot_domains=()
prompt_bool enable_remnawave_panel "Установить Remnawave panel на master?" "true"
remnawave_panel_domain=""
remnawave_panel_dir="/opt/remnawave-panel"
remnawave_panel_project_name="remnawave-panel"
remnawave_panel_postgres_user="remnawave"
remnawave_panel_postgres_db="remnawave"
remnawave_panel_postgres_password=""
remnawave_panel_jwt_auth_secret=""
remnawave_panel_jwt_api_tokens_secret=""
remnawave_panel_metrics_user="admin"
remnawave_panel_metrics_pass=""
remnawave_panel_webhook_secret=""

for i in "${!worker_hosts[@]}"; do
  worker_name="${worker_hosts[$i]}"
  worker_certbot_domain="$(default_certbot_domain_for_host "${worker_name}")"
  worker_certbot_domains+=("${worker_certbot_domain}")
done

if [ "${enable_remnawave_panel}" = "true" ]; then
  prompt remnawave_panel_domain "Публичный домен Remnawave panel на master" "panel.${master_host_name}"
  if [ -z "${remnawave_panel_domain}" ]; then
    echo "Remnawave panel domain is required when panel is enabled."
    exit 1
  fi
  remnawave_panel_postgres_password="$(generate_secret)"
  remnawave_panel_jwt_auth_secret="$(generate_secret)"
  remnawave_panel_jwt_api_tokens_secret="$(generate_secret)"
  remnawave_panel_metrics_pass="$(generate_secret)"
  remnawave_panel_webhook_secret="$(generate_secret_64)"
fi

if [ "${enable_remnawave_panel}" = "true" ] && [ "${enable_certbot}" != "true" ]; then
  echo "Remnawave panel on master requires certbot to be enabled."
  exit 1
fi

if [ "${enable_certbot}" = "true" ]; then
  if [ -z "${master_certbot_domain}" ]; then
    echo "Master host name '${master_host_name}' is not a domain."
    echo "Use host format domain=ip for master when certbot is enabled."
    exit 1
  fi
  for i in "${!worker_hosts[@]}"; do
    worker_name="${worker_hosts[$i]}"
    worker_certbot_domain="${worker_certbot_domains[$i]}"
    if [ -z "${worker_certbot_domain}" ]; then
      echo "Worker host name '${worker_name}' is not a domain."
      echo "Use worker format domain=ip when certbot is enabled."
      exit 1
    fi
  done

  prompt letsencrypt_email "Email для Let's Encrypt"
  if [ -z "${letsencrypt_email}" ]; then
    echo "Let's Encrypt email is required when certbot is enabled."
    exit 1
  fi
  prompt_secret cloudflare_api_token "Cloudflare API token (Zone:Read + DNS:Edit)"
  cloudflare_api_token="$(normalize_bearer_token "${cloudflare_api_token}")"
  if ! validate_cloudflare_token "${cloudflare_api_token}"; then
    exit 1
  fi
  prompt certbot_credentials_path "Путь credentials файла certbot на target" "/etc/letsencrypt/cloudflare.ini"
  prompt_bool cloudflare_manage_dns "Обновлять A/AAAA записи в Cloudflare из host=ip автоматически?" "true"
  if [ "${cloudflare_manage_dns}" = "true" ]; then
    if ! command -v python3 >/dev/null 2>&1; then
      echo "python3 is required for automatic Cloudflare DNS updates."
      exit 1
    fi
    dns_pairs=("${master_certbot_domain}" "${master_host_target}")
    if [ "${enable_remnawave_panel}" = "true" ]; then
      dns_pairs+=("${remnawave_panel_domain}" "${master_host_target}")
    fi
    if [ "${worker_count}" -gt 0 ]; then
      for i in "${!worker_hosts[@]}"; do
        dns_pairs+=("${worker_certbot_domains[$i]}" "${worker_targets[$i]}")
      done
    fi
    if ! cloudflare_upsert_dns_records "${cloudflare_api_token}" "${dns_pairs[@]}"; then
      echo
      echo "Cloudflare DNS sync failed."
      echo "Most common cause: wrong token format. Paste raw API token value from Cloudflare, not 'Authorization: Bearer ...'."
      echo "If you want to finish bootstrap without DNS API calls, rerun and answer 'n' to Cloudflare DNS auto-update."
      exit 1
    fi
  fi
fi

workers_allow_http_https="false"
prompt_bool enable_remnawave_node_master "Включить deploy remnawave_node на master?" "false"

if [ "${worker_count}" -gt 0 ]; then
  prompt_bool enable_remnawave_node_workers "Включить deploy remnawave_node на workers?" "false"
else
  enable_remnawave_node_workers="false"
fi

if [ "${enable_remnawave_node_master}" = "true" ] || [ "${enable_remnawave_node_workers}" = "true" ]; then
  prompt node_compose_src "Локальный путь к remnawave_node compose файлу" "deployments/prod/remnawave-node/docker-compose.yml"
  resolved_node_compose_src="${node_compose_src}"
  if [[ "${resolved_node_compose_src}" != /* ]]; then
    resolved_node_compose_src="${ROOT_DIR}/${resolved_node_compose_src}"
  fi
  if [ ! -f "${resolved_node_compose_src}" ]; then
    echo "Remnawave node compose file not found: ${node_compose_src}"
    exit 1
  fi
  prompt node_compose_dest_dir "Директория remnawave_node compose на target" "/opt/remnawave-node"
  prompt node_compose_dest_file "Полный путь remnawave_node docker-compose.yml на target" "/opt/remnawave-node/docker-compose.yml"
  prompt node_env_src "Локальный путь к default remnawave_node .env (пусто если host-specific env будут в host_vars)" ""
  prompt node_env_dest "Путь remnawave_node .env на target" "/opt/remnawave-node/.env"
  if [ -n "${node_env_src}" ]; then
    resolved_node_env_src="${node_env_src}"
    if [[ "${resolved_node_env_src}" != /* ]]; then
      resolved_node_env_src="${ROOT_DIR}/${resolved_node_env_src}"
    fi
    if [ ! -f "${resolved_node_env_src}" ]; then
      echo "Remnawave node .env file not found: ${node_env_src}"
      exit 1
    fi
  fi
fi

prompt_bool enable_monitoring "Включить monitoring на master?" "true"
prompt_bool enable_backups "Включить backups на master?" "true"
prompt_bool enable_adguard "Включить AdGuard на master?" "true"
prompt_bool enable_remnashop "Установить remnashop (бот/магазин) на master?" "false"

if [ "${enable_adguard}" = "true" ] && [ "${worker_count}" -gt 0 ] && [ "${enable_certbot}" != "true" ]; then
  echo "Workers use stubby -> master over DNS-over-TLS, so certbot must be enabled on master."
  exit 1
fi

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

allow_http_https: false

enable_nginx: false
enable_certbot: ${enable_certbot}
certbot_install: ${certbot_install}
letsencrypt_email: "${letsencrypt_email}"
cloudflare_api_token: "${cloudflare_api_token}"
certbot_credentials_path: "${certbot_credentials_path}"
certbot_dns_propagation_seconds: 60

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
firewall_master_tcp_ports:
  - 80
  - 443
enable_nginx: false
enable_certbot: ${enable_certbot}
enable_monitoring: ${enable_monitoring}
enable_backups: ${enable_backups}
enable_adguard: ${enable_adguard}
enable_remnawave_node: ${enable_remnawave_node_master}
enable_remnashop: ${enable_remnashop}
enable_remnawave_panel: ${enable_remnawave_panel}
remnashop_dir: "/opt/remnashop"
remnashop_mode: "internal"
remnashop_env_src: "${remnashop_env_src}"
remnashop_env_dest: "${remnashop_env_dest}"
remnashop_validate_env: ${remnashop_validate_env}
EOF

if [ "${enable_remnawave_node_master}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
node_compose_src: "${node_compose_src}"
node_compose_dest_dir: "${node_compose_dest_dir}"
node_compose_dest_file: "${node_compose_dest_file}"
node_env_src: "${node_env_src}"
node_env_dest: "${node_env_dest}"
EOF
fi

if [ "${enable_remnawave_panel}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
remnawave_panel_domain: "${remnawave_panel_domain}"
remnawave_panel_dir: "${remnawave_panel_dir}"
remnawave_panel_project_name: "${remnawave_panel_project_name}"
remnawave_panel_postgres_user: "${remnawave_panel_postgres_user}"
remnawave_panel_postgres_password: "${remnawave_panel_postgres_password}"
remnawave_panel_postgres_db: "${remnawave_panel_postgres_db}"
remnawave_panel_jwt_auth_secret: "${remnawave_panel_jwt_auth_secret}"
remnawave_panel_jwt_api_tokens_secret: "${remnawave_panel_jwt_api_tokens_secret}"
remnawave_panel_metrics_user: "${remnawave_panel_metrics_user}"
remnawave_panel_metrics_pass: "${remnawave_panel_metrics_pass}"
remnawave_panel_webhook_secret: "${remnawave_panel_webhook_secret}"
EOF
fi

if [ "${enable_adguard}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
adguard_web_port: ${adguard_web_port}
EOF

  if [ "${worker_count}" -gt 0 ]; then
    cat >> "${GROUP_VARS_DIR}/master.yml" <<EOF
adguard_manage_config: true
adguard_tls_enabled: true
adguard_tls_server_name: "${master_certbot_domain}"
adguard_tls_port_dns_over_tls: 953
adguard_tls_certificate_path: "/etc/letsencrypt/live/${master_certbot_domain}/fullchain.pem"
adguard_tls_private_key_path: "/etc/letsencrypt/live/${master_certbot_domain}/privkey.pem"
EOF
  fi
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
allow_http_https: ${workers_allow_http_https}
firewall_master_tcp_ports:
  - 2222
stubby_manage_config: true
stubby_tls_port: 953
enable_remnawave_node: ${enable_remnawave_node_workers}
EOF

if [ "${enable_remnawave_node_workers}" = "true" ]; then
  cat >> "${GROUP_VARS_DIR}/workers.yml" <<EOF
node_compose_src: "${node_compose_src}"
node_compose_dest_dir: "${node_compose_dest_dir}"
node_compose_dest_file: "${node_compose_dest_file}"
node_env_src: "${node_env_src}"
node_env_dest: "${node_env_dest}"
EOF
fi

if [ "${enable_certbot}" = "true" ]; then
  mkdir -p "${PRIVATE_DIR}/host_vars/${master_host_name}"
  cat > "${PRIVATE_DIR}/host_vars/${master_host_name}/certbot.yml" <<EOF
certbot_domains:
  - "${master_certbot_domain}"
EOF
  if [ "${enable_remnawave_panel}" = "true" ]; then
    cat >> "${PRIVATE_DIR}/host_vars/${master_host_name}/certbot.yml" <<EOF
  - "${remnawave_panel_domain}"
EOF
  fi

  if [ "${worker_count}" -gt 0 ]; then
    for i in "${!worker_hosts[@]}"; do
      worker_name="${worker_hosts[$i]}"
      worker_certbot_domain="${worker_certbot_domains[$i]}"
      mkdir -p "${PRIVATE_DIR}/host_vars/${worker_name}"
      cat > "${PRIVATE_DIR}/host_vars/${worker_name}/certbot.yml" <<EOF
certbot_domains:
  - "${worker_certbot_domain}"
EOF
    done
  fi
fi

echo
echo "Private inventory/vars created:"
echo "  ${PRIVATE_DIR}/hosts.yml"
echo "  ${GROUP_VARS_DIR}/all.yml"
echo "  ${GROUP_VARS_DIR}/master.yml"
echo "  ${GROUP_VARS_DIR}/workers.yml"
if [ "${enable_certbot}" = "true" ]; then
  echo "  ${PRIVATE_DIR}/host_vars/<host>/certbot.yml"
fi
echo
echo "Run:"
echo "  tools/ansible/run_prod_private.sh"

if { [ "${enable_remnawave_node_master}" = "true" ] || [ "${enable_remnawave_node_workers}" = "true" ]; } && [ -z "${node_env_src:-}" ]; then
  echo
  echo "remnawave_node is enabled, but node_env_src is empty."
  echo "Before ansible run, generate host-specific env files:"
  echo "  tools/ansible/bootstrap_remnawave_node_env.sh"
fi

if [ "${enable_remnashop}" = "true" ] && [ -z "${remnashop_env_src:-}" ]; then
  echo
  echo "remnashop is enabled, but remnashop_env_src is empty."
  echo "Ansible will keep downloaded .env.example on target and validation may fail on 'change_me'."
  echo "Set a private remnashop_env_src in:"
  echo "  ${GROUP_VARS_DIR}/master.yml"
fi
