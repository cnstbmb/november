#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIVATE_DIR="${ROOT_DIR}/.private/ansible/prod"
INVENTORY_PATH="${PRIVATE_DIR}/hosts.yml"
ALL_VARS_PATH="${PRIVATE_DIR}/group_vars/all.yml"
MASTER_VARS_PATH="${PRIVATE_DIR}/group_vars/master.yml"
TMP_DIR="${ROOT_DIR}/.tmp/ansible-local"

usage() {
  cat <<EOF
Usage:
  tools/ansible/bootstrap_remnawave_subscription_page.sh

Interactive helper:
  - reads master host/ip from ${INVENTORY_PATH}
  - writes private vars for bundled Remnawave Subscription Page
  - adds the subscription subdomain to master certbot domains
  - optionally creates/updates the Cloudflare DNS record

After running the helper:
  npm run ansible:master
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

prompt_secret() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-}"
  local value=""

  if [ -n "${default_value}" ]; then
    read -r -s -p "${message} [Enter to keep current, :clipboard or @path supported]: " value < /dev/tty
    echo
    value="${value:-${default_value}}"
  else
    while true; do
      read -r -s -p "${message} [:clipboard or @path supported]: " value < /dev/tty
      echo
      if [ -n "${value}" ]; then
        break
      fi
      echo "Значение не может быть пустым."
    done
  fi

  printf -v "${var_name}" "%s" "${value}"
}

prompt_bool() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-true}"
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

trim_trailing_newlines() {
  local value="$1"
  value="${value%$'\n'}"
  value="${value%$'\r'}"
  printf '%s' "${value}"
}

resolve_secret_input() {
  local raw_value="$1"
  local resolved=""

  if [ "${raw_value}" = ":clipboard" ]; then
    if command -v pbpaste >/dev/null 2>&1; then
      resolved="$(pbpaste)"
    else
      echo "Clipboard mode requires pbpaste on this machine." >&2
      return 1
    fi
  elif [[ "${raw_value}" == @* ]]; then
    local secret_path="${raw_value#@}"
    if [[ "${secret_path}" != /* ]]; then
      secret_path="${ROOT_DIR}/${secret_path}"
    fi
    if [ ! -f "${secret_path}" ]; then
      echo "Secret file not found: ${secret_path}" >&2
      return 1
    fi
    resolved="$(cat "${secret_path}")"
  else
    resolved="${raw_value}"
  fi

  resolved="$(trim_trailing_newlines "${resolved}")"
  printf '%s' "${resolved}"
}

read_yaml_scalar() {
  local file_path="$1"
  local key="$2"
  [ -f "${file_path}" ] || return 0

  awk -F': *' -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, ":") + 1)
      sub(/^[[:space:]]+/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      print value
      exit
    }
  ' "${file_path}"
}

extract_master_host_and_target() {
  local inventory_json_file
  inventory_json_file="$(mktemp "${TMPDIR:-/tmp}/ansible-inventory.XXXXXX")"
  ANSIBLE_LOCAL_TEMP="${TMP_DIR}" \
    ansible-inventory -i "${INVENTORY_PATH}" --list > "${inventory_json_file}"
  python3 - "${inventory_json_file}" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
hosts = data.get("master", {}).get("hosts", [])
if not hosts:
    raise SystemExit("Master group is empty in private inventory")
host = hosts[0]
hostvars = data.get("_meta", {}).get("hostvars", {}).get(host, {})
target = hostvars.get("ansible_host") or host
print(host)
print(target)
PY
  rm -f "${inventory_json_file}"
}

yaml_quote() {
  python3 - "$1" <<'PY'
import json
import sys

print(json.dumps(sys.argv[1], ensure_ascii=False))
PY
}

upsert_yaml_line() {
  local file_path="$1"
  local key="$2"
  local line="$3"
  python3 - "${file_path}" "${key}" "${line}" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
key = sys.argv[2]
line = sys.argv[3]
text = path.read_text(encoding="utf-8") if path.exists() else ""
lines = text.splitlines()
pattern = re.compile(rf"^{re.escape(key)}:\s*")
updated = False
result = []

for existing in lines:
    if pattern.match(existing):
      result.append(line)
      updated = True
    else:
      result.append(existing)

if not updated:
    if result and result[-1] != "":
        result.append("")
    result.append(line)

path.parent.mkdir(parents=True, exist_ok=True)
path.write_text("\n".join(result).rstrip() + "\n", encoding="utf-8")
PY
}

ensure_certbot_domain() {
  local file_path="$1"
  local domain="$2"
  python3 - "${file_path}" "${domain}" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
domain = sys.argv[2]
quoted_domain = f'"{domain}"'

if not path.exists():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'certbot_domains:\n  - {quoted_domain}\n', encoding="utf-8")
    raise SystemExit(0)

lines = path.read_text(encoding="utf-8").splitlines()
if any(domain == line.strip().strip('- ').strip('"') for line in lines):
    raise SystemExit(0)

result = []
inserted = False
in_list = False

for idx, line in enumerate(lines):
    result.append(line)
    if re.match(r"^certbot_domains:\s*$", line):
        in_list = True
        continue

    if in_list:
        next_line = lines[idx + 1] if idx + 1 < len(lines) else None
        if next_line is None or not re.match(r"^\s*-\s+", next_line):
            result.append(f'  - {quoted_domain}')
            inserted = True
            in_list = False

if not inserted:
    if result and result[-1] != "":
        result.append("")
    if not any(re.match(r"^certbot_domains:\s*$", line) for line in result):
        result.append("certbot_domains:")
    result.append(f'  - {quoted_domain}')

path.write_text("\n".join(result).rstrip() + "\n", encoding="utf-8")
PY
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

token = sys.argv[1].strip()
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


for i in range(0, len(pairs), 2):
    hostname = pairs[i].strip().lower()
    target_ip = pairs[i + 1].strip()
    try:
        ipaddress.ip_address(target_ip)
    except ValueError as exc:
        raise RuntimeError(
            f"Cannot create DNS record for '{hostname}': target '{target_ip}' is not an IP."
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
        record_id = records[0]["id"]
        api("PUT", f"/zones/{zone_id}/dns_records/{record_id}", payload=payload)
        print(f"Updated Cloudflare DNS: {hostname} -> {target_ip} ({record_type}, zone {zone_name})")
    else:
        api("POST", f"/zones/{zone_id}/dns_records", payload=payload)
        print(f"Created Cloudflare DNS: {hostname} -> {target_ip} ({record_type}, zone {zone_name})")
PY
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

if [ ! -f "${ALL_VARS_PATH}" ] || [ ! -f "${MASTER_VARS_PATH}" ]; then
  echo "Private group_vars not found under ${PRIVATE_DIR}"
  echo "Run tools/ansible/bootstrap_private_vars.sh first."
  exit 1
fi

mkdir -p "${TMP_DIR}"

master_info=()
while IFS= read -r line; do
  master_info+=("${line}")
done < <(extract_master_host_and_target)

if [ "${#master_info[@]}" -lt 2 ]; then
  echo "Failed to resolve master host and IP from ${INVENTORY_PATH}" >&2
  exit 1
fi

master_host="${master_info[0]}"
master_target="${master_info[1]}"
master_panel_domain="$(read_yaml_scalar "${MASTER_VARS_PATH}" "remnawave_panel_domain")"
current_sub_domain="$(read_yaml_scalar "${MASTER_VARS_PATH}" "remnawave_subscription_page_domain")"
current_app_port="$(read_yaml_scalar "${MASTER_VARS_PATH}" "remnawave_subscription_page_app_port")"
current_api_token="$(read_yaml_scalar "${MASTER_VARS_PATH}" "remnawave_subscription_page_api_token")"
cloudflare_api_token="$(read_yaml_scalar "${ALL_VARS_PATH}" "cloudflare_api_token")"
master_certbot_path="${PRIVATE_DIR}/host_vars/${master_host}/certbot.yml"

if [ -z "${master_panel_domain}" ]; then
  echo "remnawave_panel_domain is missing in ${MASTER_VARS_PATH}." >&2
  echo "Configure the panel first." >&2
  exit 1
fi

default_sub_domain="${current_sub_domain:-sub.${master_host}}"
default_app_port="${current_app_port:-3010}"

echo "=== Remnawave Subscription Page bootstrap ==="
echo "Master host: ${master_host}"
echo "Master target: ${master_target}"
echo "Panel domain: ${master_panel_domain}"

prompt sub_domain "Публичный домен Subscription Page" "${default_sub_domain}"
prompt app_port "Локальный APP_PORT для subscription-page" "${default_app_port}"
prompt_secret api_token_raw "REMNAWAVE_API_TOKEN для subscription-page" "${current_api_token}"
api_token="$(resolve_secret_input "${api_token_raw}")"

if [ -z "${api_token}" ]; then
  echo "REMNAWAVE_API_TOKEN не может быть пустым." >&2
  exit 1
fi

prompt_bool create_dns_record "Создать/обновить DNS запись ${sub_domain} -> ${master_target} в Cloudflare?" "true"
prompt_bool add_certbot_domain "Добавить ${sub_domain} в certbot_domains master?" "true"

upsert_yaml_line "${MASTER_VARS_PATH}" "enable_remnawave_subscription_page" "enable_remnawave_subscription_page: true"
upsert_yaml_line "${MASTER_VARS_PATH}" "remnawave_subscription_page_domain" "remnawave_subscription_page_domain: $(yaml_quote "${sub_domain}")"
upsert_yaml_line "${MASTER_VARS_PATH}" "remnawave_subscription_page_app_port" "remnawave_subscription_page_app_port: ${app_port}"
upsert_yaml_line "${MASTER_VARS_PATH}" "remnawave_subscription_page_api_token" "remnawave_subscription_page_api_token: $(yaml_quote "${api_token}")"
upsert_yaml_line "${MASTER_VARS_PATH}" "remnawave_panel_sub_public_domain" "remnawave_panel_sub_public_domain: $(yaml_quote "${sub_domain}")"

if [ "${add_certbot_domain}" = "true" ]; then
  ensure_certbot_domain "${master_certbot_path}" "${sub_domain}"
fi

if [ "${create_dns_record}" = "true" ]; then
  if [ -z "${cloudflare_api_token}" ]; then
    echo "cloudflare_api_token is missing in ${ALL_VARS_PATH}; skipping DNS update." >&2
  else
    cloudflare_upsert_dns_records "${cloudflare_api_token}" "${sub_domain}" "${master_target}"
  fi
fi

echo
echo "Subscription Page vars written:"
echo "  - ${MASTER_VARS_PATH}"
if [ "${add_certbot_domain}" = "true" ]; then
  echo "  - ${master_certbot_path}"
fi
echo
echo "Next step:"
echo "  npm run ansible:master"
