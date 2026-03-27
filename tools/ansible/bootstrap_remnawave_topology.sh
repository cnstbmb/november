#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIVATE_DIR="${ROOT_DIR}/.private/ansible/prod"
INVENTORY_PATH="${PRIVATE_DIR}/hosts.yml"
HOST_VARS_DIR="${PRIVATE_DIR}/host_vars"
TOPOLOGY_DIR="${PRIVATE_DIR}/remnawave-topology"
PROFILES_DIR="${TOPOLOGY_DIR}/profiles"
TOPOLOGY_SPEC_FILE="${TOPOLOGY_DIR}/topology-spec.json"
TOPOLOGY_VARS_FILE="${TOPOLOGY_DIR}/topology.yml"
SUMMARY_FILE="${TOPOLOGY_DIR}/README.generated.md"
ENTRY_MASTER_EXIT_RENDERER="${ROOT_DIR}/tools/ansible/remnawave/entry-master-exit/render_entry_master_exit.py"

# Opinionated hard defaults for supported topology modes.
# Current production topology is entry -> master -> exit with WireGuard.
DEFAULT_GENERATION_MODE="entry_master_exit"

# Legacy/current XHTTP multi-exit mode.
DEFAULT_EDGE_CLIENT_PORT="443"
DEFAULT_EDGE_REALITY_TARGET="sun6-22.userapi.com:443"
DEFAULT_EDGE_REALITY_SERVER_NAME="sun6-22.userapi.com"
DEFAULT_EDGE_XHTTP_HOST="sun6-22.userapi.com"
DEFAULT_EDGE_XHTTP_PATH="/s/v1/ig2/asset.jpg"
DEFAULT_TRANSIT_INBOUND_PORT="9443"
DEFAULT_TRANSIT_XHTTP_PATH="/assets/runtime-8f3c21.js"
DEFAULT_TRANSIT_DIRECT_GEOIP="ru"
DEFAULT_TRANSIT_DIRECT_GEOSITE="category-ru"
DEFAULT_EXIT_BASE_INBOUND_PORT="8442"
DEFAULT_EXIT_XHTTP_PATH="/assets/runtime-3o3u46.js"
DEFAULT_EXIT_DIRECT_ENABLED="true"
DEFAULT_EXIT_DIRECT_PORT="443"
DEFAULT_EXIT_DIRECT_TARGET="www.microsoft.com:443"
DEFAULT_EXIT_DIRECT_SERVER_NAME="www.microsoft.com"
DEFAULT_EXIT_DIRECT_XHTTP_HOST="www.microsoft.com"
DEFAULT_EXIT_DIRECT_XHTTP_PATH="/static/chunks/main-91ac4d.js"

# Entry -> master -> exit mode with mandatory WireGuard on master.
DEFAULT_ENTRY_PUBLIC_PORT="443"
DEFAULT_ENTRY_REALITY_TARGET="sun6-22.userapi.com:443"
DEFAULT_ENTRY_REALITY_SERVER_NAME="sun6-22.userapi.com"
DEFAULT_ENTRY_TO_MASTER_PORT="5335"
DEFAULT_ENTRY_TO_MASTER_PATH="/fluegergeheimer"
DEFAULT_MASTER_WG_PORT="51820"
DEFAULT_MASTER_PUBLIC_PORT="10443"
DEFAULT_MASTER_REALITY_TARGET="borsaistanbul.com:443"
DEFAULT_MASTER_REALITY_SERVER_NAMES="borsaistanbul.com,www.borsaistanbul.com"
DEFAULT_MASTER_DIRECT_MSK_PORT="20443"
DEFAULT_MASTER_DIRECT_MSK_TARGET="borsaistanbul.com:443"
DEFAULT_MASTER_DIRECT_MSK_SERVER_NAMES="borsaistanbul.com,www.borsaistanbul.com"
DEFAULT_MASTER_IPV4_GEOIP_CODES="ru,cn"
DEFAULT_MASTER_IPV4_GEOSITE="category-ru,youtube"
DEFAULT_MASTER_TO_EXIT_PORT="8443"
DEFAULT_EXIT_PUBLIC_DIRECT_PORT="443"
DEFAULT_EXIT_REALITY_TARGET="apple.com:443"
DEFAULT_EXIT_REALITY_SERVER_NAMES="apple.com,www.apple.com"
DEFAULT_WG_ALLOWED_IP_BASE="10.8.0"

usage() {
  cat <<USAGE
Usage:
  tools/ansible/bootstrap_remnawave_topology.sh

Interactive helper:
  - reads master/workers from ${INVENTORY_PATH}
  - supports two generation modes:
    1) edge -> transit -> multiple exits on XHTTP
    2) entry -> master -> exit with mandatory WireGuard on master
  - writes profile JSON files to ${PROFILES_DIR}
  - writes firewall_extra_tcp_ports and firewall_extra_udp_ports to
    host_vars/<host>/remnawave_topology.yml
USAGE
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

prompt_bool() {
  local var_name="$1"
  local message="$2"
  local default_value="${3:-false}"
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

prompt_int() {
  local var_name="$1"
  local message="$2"
  local default_value="$3"
  local min_value="${4:-1}"
  local max_value="${5:-65535}"
  local value

  while true; do
    read -r -p "${message} [${default_value}]: " value < /dev/tty
    value="${value:-${default_value}}"
    if [[ "${value}" =~ ^[0-9]+$ ]] && [ "${value}" -ge "${min_value}" ] && [ "${value}" -le "${max_value}" ]; then
      printf -v "${var_name}" "%s" "${value}"
      return
    fi
    echo "Введите число от ${min_value} до ${max_value}."
  done
}

normalize_existing_topology_spec() {
  local spec_path="$1"
  local normalized_file

  [ -f "${spec_path}" ] || return 1
  normalized_file="$(mktemp "${TMPDIR:-/tmp}/topology-spec-normalized.XXXXXX")"

  if python3 - "${spec_path}" "${normalized_file}" <<'__PY_SPEC__'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
dest = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")
candidates = [text]
if "\\n" in text:
    candidates.append(text.replace("\\n", "\n"))

for candidate in candidates:
    try:
        data = json.loads(candidate)
    except Exception:
        continue
    dest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    raise SystemExit(0)

raise SystemExit(1)
__PY_SPEC__
  then
    printf '%s' "${normalized_file}"
    return 0
  fi

  rm -f "${normalized_file}"
  return 1
}

spec_query() {
  local expr="$1"
  [ -n "${EXISTING_TOPOLOGY_SPEC_PATH:-}" ] || return 0

  python3 - "${EXISTING_TOPOLOGY_SPEC_PATH}" "${expr}" <<'__PY_QUERY__'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expr = sys.argv[2]
value = data

for part in expr.split("."):
    if value is None:
        break
    while "[" in part:
        prefix, rest = part.split("[", 1)
        if prefix:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(prefix)
        if value is None:
            break
        idx_str, remainder = rest.split("]", 1)
        if not isinstance(value, list):
            value = None
            break
        idx = int(idx_str)
        if idx < 0 or idx >= len(value):
            value = None
            break
        value = value[idx]
        part = remainder.lstrip(".")
        if not part:
            break
    else:
        if part:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(part)

if value is None:
    raise SystemExit(0)

if isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (int, float)):
    print(value)
elif isinstance(value, list):
    print(",".join(str(item) for item in value))
elif isinstance(value, dict):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
__PY_QUERY__
}

spec_query_len() {
  local expr="$1"
  [ -n "${EXISTING_TOPOLOGY_SPEC_PATH:-}" ] || return 0

  python3 - "${EXISTING_TOPOLOGY_SPEC_PATH}" "${expr}" <<'__PY_QUERY_LEN__'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expr = sys.argv[2]
value = data

for part in expr.split("."):
    if value is None:
        break
    while "[" in part:
        prefix, rest = part.split("[", 1)
        if prefix:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(prefix)
        if value is None:
            break
        idx_str, remainder = rest.split("]", 1)
        if not isinstance(value, list):
            value = None
            break
        idx = int(idx_str)
        if idx < 0 or idx >= len(value):
            value = None
            break
        value = value[idx]
        part = remainder.lstrip(".")
        if not part:
            break
    else:
        if part:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(part)

if isinstance(value, list):
    print(len(value))
__PY_QUERY_LEN__
}

spec_exit_query() {
  local host_name="$1"
  local field_expr="$2"
  [ -n "${EXISTING_TOPOLOGY_SPEC_PATH:-}" ] || return 0

  python3 - "${EXISTING_TOPOLOGY_SPEC_PATH}" "${host_name}" "${field_expr}" <<'__PY_EXIT_QUERY__'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
host_name = sys.argv[2]
field_expr = sys.argv[3]

entry = None
for item in data.get("exits", []):
    if item.get("host") == host_name:
        entry = item
        break

if entry is None:
    raise SystemExit(0)

value = entry
for part in field_expr.split("."):
    if value is None:
        break
    if not part:
        continue
    if not isinstance(value, dict):
        value = None
        break
    value = value.get(part)

if value is None:
    raise SystemExit(0)

if isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (int, float)):
    print(value)
elif isinstance(value, list):
    print(",".join(str(item) for item in value))
elif isinstance(value, dict):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
__PY_EXIT_QUERY__
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

normalize_csv_list() {
  local raw="$1"
  local out=""
  local item
  local IFS=','
  local -a parts=()
  read -r -a parts <<< "${raw}" || true
  if [ "${#parts[@]}" -eq 0 ]; then
    printf '%s' ""
    return 0
  fi
  for item in "${parts[@]}"; do
    item="$(trim_whitespace "${item}")"
    [ -z "${item}" ] && continue
    if [ -n "${out}" ]; then
      out+=","
    fi
    out+="${item}"
  done
  printf '%s' "${out}"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "${value}"
}

csv_to_json_array() {
  local csv normalized item out=""
  csv="$1"
  normalized="$(normalize_csv_list "${csv}")"
  [ -z "${normalized}" ] && return 0

  local IFS=','
  local -a parts=()
  read -r -a parts <<< "${normalized}" || true
  if [ "${#parts[@]}" -eq 0 ]; then
    printf '%s' ""
    return 0
  fi
  for item in "${parts[@]}"; do
    [ -z "${item}" ] && continue
    if [ -n "${out}" ]; then
      out+=", "
    fi
    out+="\"$(json_escape "${item}")\""
  done
  printf '%s' "${out}"
}

sanitize_slug() {
  local value="$1"
  value="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-')"
  value="$(printf '%s' "${value}" | sed -E 's/-+/-/g; s/^-+//; s/-+$//')"
  printf '%s' "${value}"
}

placeholder_slug() {
  local value="$1"
  value="$(printf '%s' "${value}" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '_')"
  value="$(printf '%s' "${value}" | sed -E 's/_+/_/g; s/^_+//; s/_+$//')"
  printf '%s' "${value}"
}

extract_group_hosts() {
  local group_name="$1"
  local inventory_json_file
  inventory_json_file="$(mktemp "${TMPDIR:-/tmp}/ansible-inventory.XXXXXX")"
  ANSIBLE_LOCAL_TEMP="${ROOT_DIR}/.tmp/ansible-local" \
    ansible-inventory -i "${INVENTORY_PATH}" --list > "${inventory_json_file}"
  python3 - "${inventory_json_file}" "${group_name}" <<'__PY_INV__'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
for host in data.get(sys.argv[2], {}).get("hosts", []):
    if isinstance(host, str) and host.strip():
        print(host.strip())
__PY_INV__
  rm -f "${inventory_json_file}"
}

contains_host() {
  local host_name="$1"
  local hosts_list="$2"
  printf '%s\n' "${hosts_list}" | awk -v host="${host_name}" 'NF && $0 == host { found = 1 } END { exit(found ? 0 : 1) }'
}

count_hosts() {
  printf '%s\n' "$1" | awk 'NF' | wc -l | tr -d ' '
}

first_host() {
  printf '%s\n' "$1" | awk 'NF { print; exit }'
}

nth_host() {
  local hosts_list="$1"
  local target_index="$2"
  printf '%s\n' "${hosts_list}" | awk -v idx="${target_index}" 'NF { count += 1; if (count == idx) { print; exit } }'
}

host_index() {
  local hosts_list="$1"
  local target_host="$2"
  printf '%s\n' "${hosts_list}" | awk -v host="${target_host}" 'NF { count += 1; if ($0 == host) { print count; exit } }'
}

print_host_choices() {
  local hosts_list="$1"
  printf '%s\n' "${hosts_list}" | awk 'NF { count += 1; printf("  %d) %s\n", count, $0) }'
}

resolve_host_choice() {
  local raw_choice="$1"
  local hosts_list="$2"
  local resolved_host=""

  if [[ "${raw_choice}" =~ ^[0-9]+$ ]]; then
    resolved_host="$(nth_host "${hosts_list}" "${raw_choice}")"
  elif contains_host "${raw_choice}" "${hosts_list}"; then
    resolved_host="${raw_choice}"
  fi

  printf '%s' "${resolved_host}"
}

prompt_host_choice() {
  local var_name="$1"
  local message="$2"
  local hosts_list="$3"
  local default_host="$4"
  local default_index raw_choice resolved_host

  default_index="$(host_index "${hosts_list}" "${default_host}")"
  [ -z "${default_index}" ] && default_index="1"

  while true; do
    echo "${message}:"
    print_host_choices "${hosts_list}"
    read -r -p "Выбери номер или hostname [${default_index}]: " raw_choice < /dev/tty
    raw_choice="${raw_choice:-${default_index}}"
    resolved_host="$(resolve_host_choice "${raw_choice}" "${hosts_list}")"
    if [ -n "${resolved_host}" ]; then
      printf -v "${var_name}" "%s" "${resolved_host}"
      return
    fi
    echo "Некорректный выбор: ${raw_choice}"
  done
}

default_certbot_domain_for_host() {
  local host_name="$1"
  if [[ "${host_name}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || [[ "${host_name}" == *:* ]]; then
    echo ""
  else
    echo "${host_name}"
  fi
}

certbot_domain_for_host() {
  local host_name="$1"
  local certbot_file="${HOST_VARS_DIR}/${host_name}/certbot.yml"
  local domain=""

  if [ -f "${certbot_file}" ]; then
    domain="$(awk '
      /^\s*certbot_domains:\s*$/ { in_list = 1; next }
      in_list && /^\s*-\s*/ {
        value = $0
        sub(/^\s*-\s*/, "", value)
        gsub(/^["'"'"']|["'"'"']$/, "", value)
        print value
        exit
      }
      in_list && !/^\s*-\s*/ { exit }
    ' "${certbot_file}")"
  fi

  if [ -n "${domain}" ]; then
    printf '%s\n' "${domain}"
  else
    default_certbot_domain_for_host "${host_name}"
  fi
}

inventory_host_var() {
  local host_name="$1"
  local var_name="$2"
  local host_json_file

  host_json_file="$(mktemp "${TMPDIR:-/tmp}/ansible-host.XXXXXX")"
  ANSIBLE_LOCAL_TEMP="${ROOT_DIR}/.tmp/ansible-local" \
    ansible-inventory -i "${INVENTORY_PATH}" --host "${host_name}" > "${host_json_file}"
  python3 - "${host_json_file}" "${var_name}" <<'__PY_HOST_VAR__'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)

value = data.get(sys.argv[2])
if value is None:
    raise SystemExit(0)
if isinstance(value, (dict, list)):
    raise SystemExit(0)
print(value)
__PY_HOST_VAR__
  rm -f "${host_json_file}"
}

inventory_public_address_for_host() {
  local host_name="$1"
  local public_address=""

  public_address="$(inventory_host_var "${host_name}" "ansible_host" || true)"
  if [ -n "${public_address}" ]; then
    printf '%s\n' "${public_address}"
  else
    printf '%s\n' "${host_name}"
  fi
}

prompt_generation_mode() {
  local var_name="$1"
  local default_mode="${2:-${DEFAULT_GENERATION_MODE}}"
  local default_choice="1"
  local choice=""

  if [ "${default_mode}" = "entry_master_exit" ]; then
    default_choice="2"
  fi

  while true; do
    echo "Generation mode:"
    echo "  1) edge -> transit -> multiple exits (XHTTP)"
    echo "  2) entry -> master -> exit + WireGuard"
    read -r -p "Выбери режим [${default_choice}]: " choice < /dev/tty
    choice="${choice:-${default_choice}}"
    case "${choice}" in
      1|xhttp|xhttp_multi_exit)
        printf -v "${var_name}" "xhttp_multi_exit"
        return
        ;;
      2|entry|entry_master_exit|master)
        printf -v "${var_name}" "entry_master_exit"
        return
        ;;
      *)
        echo "Некорректный выбор: ${choice}"
        ;;
    esac
  done
}

generate_short_id() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 4
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'__PY_SHORT__'
import secrets
print(secrets.token_hex(4))
__PY_SHORT__
    return
  fi
  echo "deadbeef"
}

generate_reality_keypair() {
  local output private_key public_key
  if ! command -v xray >/dev/null 2>&1; then
    return 1
  fi

  output="$(xray x25519 2>/dev/null || true)"
  private_key="$(printf '%s\n' "${output}" | awk -F': ' '/Private key:|PrivateKey:/ { print $2; exit }')"
  public_key="$(printf '%s\n' "${output}" | awk -F': ' '/Public key:|PublicKey:|Password:/ { print $2; exit }')"

  if [ -z "${private_key}" ] || [ -z "${public_key}" ]; then
    return 1
  fi

  printf '%s\n%s\n' "${private_key}" "${public_key}"
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

EXISTING_TOPOLOGY_SPEC_PATH=""

mkdir -p "${ROOT_DIR}/.tmp/ansible-local" "${TOPOLOGY_DIR}" "${PROFILES_DIR}"

if [ -f "${TOPOLOGY_SPEC_FILE}" ]; then
  EXISTING_TOPOLOGY_SPEC_PATH="$(normalize_existing_topology_spec "${TOPOLOGY_SPEC_FILE}" || true)"
fi

if [ -n "${EXISTING_TOPOLOGY_SPEC_PATH}" ]; then
  trap 'rm -f "${EXISTING_TOPOLOGY_SPEC_PATH}"' EXIT
fi

master_hosts="$(extract_group_hosts master)"
worker_hosts="$(extract_group_hosts workers)"

existing_generation_mode="$(spec_query "mode" || true)"
[ -z "${existing_generation_mode}" ] && existing_generation_mode="${DEFAULT_GENERATION_MODE}"
prompt_generation_mode generation_mode "${existing_generation_mode}"

if [ "${generation_mode}" = "entry_master_exit" ]; then
  if [ ! -f "${ENTRY_MASTER_EXIT_RENDERER}" ]; then
    echo "Renderer not found: ${ENTRY_MASTER_EXIT_RENDERER}"
    exit 1
  fi

  if [ "$(count_hosts "${master_hosts}")" -lt 1 ]; then
    echo "At least one master host is required in ${INVENTORY_PATH}."
    exit 1
  fi

  if [ "$(count_hosts "${worker_hosts}")" -lt 2 ]; then
    echo "This topology expects at least two worker hosts: entry and exit."
    exit 1
  fi

  default_master_host="$(first_host "${master_hosts}")"
  default_entry_host="$(first_host "${worker_hosts}")"

  echo "=== Remnawave topology bootstrap (entry -> master -> exit + WireGuard) ==="
  echo "Profiles will be generated for:"
  echo "  entry client inbound: VLESS + TCP + REALITY"
  echo "  entry -> master: XHTTP over TLS"
  echo "  master public: REALITY on 10443"
  echo "  master public direct: REALITY on 20443"
  echo "  mandatory WireGuard on master"
  echo "  master -> exit: gRPC over TLS"
  echo

  prompt_host_choice master_host "Master host" "${master_hosts}" "${default_master_host}"
  prompt_host_choice entry_host "Entry host (worker)" "${worker_hosts}" "${default_entry_host}"

  remaining_exit_hosts="$(printf '%s\n' "${worker_hosts}" | awk -v entry="${entry_host}" 'NF && $0 != entry')"
  if [ "$(count_hosts "${remaining_exit_hosts}")" -lt 1 ]; then
    echo "No worker hosts left for exit after selecting entry=${entry_host}."
    exit 1
  fi

  default_exit_host="$(first_host "${remaining_exit_hosts}")"
  prompt_host_choice exit_host "Exit host (worker)" "${remaining_exit_hosts}" "${default_exit_host}"

  entry_public_address="$(inventory_public_address_for_host "${entry_host}")"
  master_public_address="$(inventory_public_address_for_host "${master_host}")"
  exit_public_address="$(inventory_public_address_for_host "${exit_host}")"

  master_cert_domain="$(certbot_domain_for_host "${master_host}")"
  exit_cert_domain="$(certbot_domain_for_host "${exit_host}")"
  if [ -z "${master_cert_domain}" ] || [ -z "${exit_cert_domain}" ]; then
    echo "Could not determine certbot domains for master=${master_host} or exit=${exit_host}."
    exit 1
  fi

  prompt_int entry_public_port "Client-facing port on ${entry_host}" "${DEFAULT_ENTRY_PUBLIC_PORT}"
  prompt entry_reality_target "Reality target for ${entry_host}" "${DEFAULT_ENTRY_REALITY_TARGET}"
  prompt entry_reality_server_name "Reality serverName for ${entry_host}" "${DEFAULT_ENTRY_REALITY_SERVER_NAME}"

  generated_entry_private="REPLACE_ENTRY_REALITY_PRIVATE_KEY"
  generated_entry_public="REPLACE_ENTRY_REALITY_PUBLIC_KEY"
  entry_reality_short_id_default="$(generate_short_id)"
  if generated_entry_output="$(generate_reality_keypair)"; then
    generated_entry_private="$(printf '%s\n' "${generated_entry_output}" | sed -n '1p')"
    generated_entry_public="$(printf '%s\n' "${generated_entry_output}" | sed -n '2p')"
  fi
  prompt entry_reality_private_key "Reality private key for ${entry_host}" "${generated_entry_private}"
  prompt entry_reality_public_key "Reality public key for ${entry_host}" "${generated_entry_public}"
  prompt entry_reality_short_id "Reality shortId for ${entry_host}" "${entry_reality_short_id_default}"

  prompt_int bridge_master_port "Bridge inbound port on ${master_host}" "${DEFAULT_ENTRY_TO_MASTER_PORT}"
  prompt bridge_master_host "XHTTP/TLS host for ${entry_host} -> ${master_host}" "${master_cert_domain}"
  prompt bridge_master_path "XHTTP path for ${entry_host} -> ${master_host}" "${DEFAULT_ENTRY_TO_MASTER_PATH}"
  prompt entry_to_master_uuid \
    "Service-user UUID for ${entry_host} -> ${master_host}" \
    "REPLACE_$(placeholder_slug "${entry_host}_TO_${master_host}")_SERVICE_UUID"

  prompt_int master_wg_port "WireGuard port on ${master_host}" "${DEFAULT_MASTER_WG_PORT}"
  prompt wg_allowed_ip_base "WireGuard allowed IP base on ${master_host} (three octets)" "${DEFAULT_WG_ALLOWED_IP_BASE}"
  prompt wg_secret_key "WireGuard secretKey for ${master_host}" "REPLACE_WG_SECRET_KEY"
  prompt wg_peer_public_keys_csv \
    "WireGuard peer public keys for ${master_host} (comma-separated)" \
    "REPLACE_WG_PEER_PUBLIC_KEY"
  wg_peer_public_keys_csv="$(normalize_csv_list "${wg_peer_public_keys_csv}")"
  if [ -z "${wg_peer_public_keys_csv}" ]; then
    echo "At least one WireGuard peer public key is required."
    exit 1
  fi

  wg_peer_entries=""
  IFS=',' read -r -a wg_peer_keys <<< "${wg_peer_public_keys_csv}" || true
  wg_peer_index=2
  for wg_peer_key in "${wg_peer_keys[@]}"; do
    [ -z "${wg_peer_key}" ] && continue
    wg_allowed_ip="${wg_allowed_ip_base}.${wg_peer_index}/32"
    wg_peer_entry="$(cat <<EOF
        {
          "public_key": "$(json_escape "${wg_peer_key}")",
          "allowed_ip": "$(json_escape "${wg_allowed_ip}")"
        }
EOF
)"
    if [ -n "${wg_peer_entries}" ]; then
      wg_peer_entries+=$',\n'
    fi
    wg_peer_entries+="${wg_peer_entry}"
    wg_peer_index=$((wg_peer_index + 1))
  done

  prompt_int master_public_port "Public Moscow port on ${master_host}" "${DEFAULT_MASTER_PUBLIC_PORT}"
  prompt master_reality_target "Reality target for ${master_host}:${master_public_port}" "${DEFAULT_MASTER_REALITY_TARGET}"
  prompt master_reality_server_names_csv \
    "Reality serverNames for ${master_host}:${master_public_port} (comma-separated)" \
    "${DEFAULT_MASTER_REALITY_SERVER_NAMES}"
  master_reality_server_names_csv="$(normalize_csv_list "${master_reality_server_names_csv}")"
  generated_master_private="REPLACE_MASTER_REALITY_PRIVATE_KEY"
  generated_master_public="REPLACE_MASTER_REALITY_PUBLIC_KEY"
  master_reality_short_id_default="$(generate_short_id)"
  if generated_master_output="$(generate_reality_keypair)"; then
    generated_master_private="$(printf '%s\n' "${generated_master_output}" | sed -n '1p')"
    generated_master_public="$(printf '%s\n' "${generated_master_output}" | sed -n '2p')"
  fi
  prompt master_reality_private_key "Reality private key for ${master_host}:${master_public_port}" "${generated_master_private}"
  prompt master_reality_public_key "Reality public key for ${master_host}:${master_public_port}" "${generated_master_public}"
  prompt master_reality_short_id "Reality shortId for ${master_host}:${master_public_port}" "${master_reality_short_id_default}"

  prompt_int master_direct_msk_port "Direct Moscow port on ${master_host}" "${DEFAULT_MASTER_DIRECT_MSK_PORT}"
  prompt master_direct_msk_target "Reality target for ${master_host}:${master_direct_msk_port}" "${DEFAULT_MASTER_DIRECT_MSK_TARGET}"
  prompt master_direct_msk_server_names_csv \
    "Reality serverNames for ${master_host}:${master_direct_msk_port} (comma-separated)" \
    "${DEFAULT_MASTER_DIRECT_MSK_SERVER_NAMES}"
  master_direct_msk_server_names_csv="$(normalize_csv_list "${master_direct_msk_server_names_csv}")"
  generated_master_direct_private="REPLACE_MASTER_DIRECT_MSK_REALITY_PRIVATE_KEY"
  generated_master_direct_public="REPLACE_MASTER_DIRECT_MSK_REALITY_PUBLIC_KEY"
  master_direct_msk_short_id_default="$(generate_short_id)"
  if generated_master_direct_output="$(generate_reality_keypair)"; then
    generated_master_direct_private="$(printf '%s\n' "${generated_master_direct_output}" | sed -n '1p')"
    generated_master_direct_public="$(printf '%s\n' "${generated_master_direct_output}" | sed -n '2p')"
  fi
  prompt master_direct_msk_private_key "Reality private key for ${master_host}:${master_direct_msk_port}" "${generated_master_direct_private}"
  prompt master_direct_msk_public_key "Reality public key for ${master_host}:${master_direct_msk_port}" "${generated_master_direct_public}"
  prompt master_direct_msk_short_id "Reality shortId for ${master_host}:${master_direct_msk_port}" "${master_direct_msk_short_id_default}"

  prompt master_route_ipv4_geoip_csv \
    "GeoIP country codes that should use IPv4 direct egress on ${master_host} (comma-separated)" \
    "${DEFAULT_MASTER_IPV4_GEOIP_CODES}"
  prompt master_route_ipv4_geosite_csv \
    "Geosite selectors that should use IPv4 direct egress on ${master_host} (comma-separated)" \
    "${DEFAULT_MASTER_IPV4_GEOSITE}"
  master_route_ipv4_geoip_csv="$(normalize_csv_list "${master_route_ipv4_geoip_csv}")"
  master_route_ipv4_geosite_csv="$(normalize_csv_list "${master_route_ipv4_geosite_csv}")"

  prompt_int exit_bridge_inbound_port "Bridge inbound port on ${exit_host}" "${DEFAULT_MASTER_TO_EXIT_PORT}"
  prompt master_to_exit_address "Dial address for ${master_host} -> ${exit_host}" "${exit_public_address}"
  prompt master_to_exit_server_name "TLS serverName for ${master_host} -> ${exit_host}" "${exit_cert_domain}"
  prompt master_to_exit_uuid \
    "Service-user UUID for ${master_host} -> ${exit_host}" \
    "REPLACE_$(placeholder_slug "${master_host}_TO_${exit_host}")_SERVICE_UUID"

  prompt_int exit_public_port "Direct client port on ${exit_host}" "${DEFAULT_EXIT_PUBLIC_DIRECT_PORT}"
  prompt exit_reality_target "Reality target for ${exit_host}" "${DEFAULT_EXIT_REALITY_TARGET}"
  prompt exit_reality_server_names_csv \
    "Reality serverNames for ${exit_host} (comma-separated)" \
    "${DEFAULT_EXIT_REALITY_SERVER_NAMES}"
  exit_reality_server_names_csv="$(normalize_csv_list "${exit_reality_server_names_csv}")"
  generated_exit_private="REPLACE_EXIT_REALITY_PRIVATE_KEY"
  generated_exit_public="REPLACE_EXIT_REALITY_PUBLIC_KEY"
  exit_reality_short_id_default="$(generate_short_id)"
  if generated_exit_output="$(generate_reality_keypair)"; then
    generated_exit_private="$(printf '%s\n' "${generated_exit_output}" | sed -n '1p')"
    generated_exit_public="$(printf '%s\n' "${generated_exit_output}" | sed -n '2p')"
  fi
  prompt exit_reality_private_key "Reality private key for ${exit_host}" "${generated_exit_private}"
  prompt exit_reality_public_key "Reality public key for ${exit_host}" "${generated_exit_public}"
  prompt exit_reality_short_id "Reality shortId for ${exit_host}" "${exit_reality_short_id_default}"

  cat > "${TOPOLOGY_SPEC_FILE}" <<__SPEC_ENTRY_MASTER_EXIT__
{
  "mode": "entry_master_exit",
  "entry": {
    "host": "$(json_escape "${entry_host}")",
    "public_address": "$(json_escape "${entry_public_address}")",
    "public_port": ${entry_public_port},
    "reality_target": "$(json_escape "${entry_reality_target}")",
    "reality_server_name": "$(json_escape "${entry_reality_server_name}")",
    "reality_private_key": "$(json_escape "${entry_reality_private_key}")",
    "reality_public_key": "$(json_escape "${entry_reality_public_key}")",
    "reality_short_id": "$(json_escape "${entry_reality_short_id}")",
    "bridge_uuid": "$(json_escape "${entry_to_master_uuid}")",
    "to_master_address": "$(json_escape "${bridge_master_host}")",
    "to_master_port": ${bridge_master_port},
    "to_master_server_name": "$(json_escape "${bridge_master_host}")",
    "to_master_host": "$(json_escape "${bridge_master_host}")",
    "to_master_path": "$(json_escape "${bridge_master_path}")"
  },
  "master": {
    "host": "$(json_escape "${master_host}")",
    "public_address": "$(json_escape "${master_public_address}")",
    "cert_domain": "$(json_escape "${master_cert_domain}")",
    "bridge_inbound_port": ${bridge_master_port},
    "bridge_host": "$(json_escape "${bridge_master_host}")",
    "bridge_path": "$(json_escape "${bridge_master_path}")",
    "wg_port": ${master_wg_port},
    "wg_secret_key": "$(json_escape "${wg_secret_key}")",
    "wg_peers": [
${wg_peer_entries}
    ],
    "reality_moscow": {
      "port": ${master_public_port},
      "target": "$(json_escape "${master_reality_target}")",
      "server_names": [$(csv_to_json_array "${master_reality_server_names_csv}")],
      "private_key": "$(json_escape "${master_reality_private_key}")",
      "public_key": "$(json_escape "${master_reality_public_key}")",
      "short_id": "$(json_escape "${master_reality_short_id}")"
    },
    "reality_direct_msk": {
      "port": ${master_direct_msk_port},
      "target": "$(json_escape "${master_direct_msk_target}")",
      "server_names": [$(csv_to_json_array "${master_direct_msk_server_names_csv}")],
      "private_key": "$(json_escape "${master_direct_msk_private_key}")",
      "public_key": "$(json_escape "${master_direct_msk_public_key}")",
      "short_id": "$(json_escape "${master_direct_msk_short_id}")"
    },
    "to_exit_uuid": "$(json_escape "${master_to_exit_uuid}")",
    "to_exit_address": "$(json_escape "${master_to_exit_address}")",
    "to_exit_port": ${exit_bridge_inbound_port},
    "to_exit_server_name": "$(json_escape "${master_to_exit_server_name}")",
    "route_ipv4_geoip": [$(csv_to_json_array "${master_route_ipv4_geoip_csv}")],
    "route_ipv4_geosite": [$(csv_to_json_array "${master_route_ipv4_geosite_csv}")]
  },
  "exit": {
    "host": "$(json_escape "${exit_host}")",
    "public_address": "$(json_escape "${exit_public_address}")",
    "cert_domain": "$(json_escape "${exit_cert_domain}")",
    "public_port": ${exit_public_port},
    "bridge_inbound_port": ${exit_bridge_inbound_port},
    "reality_target": "$(json_escape "${exit_reality_target}")",
    "reality_server_names": [$(csv_to_json_array "${exit_reality_server_names_csv}")],
    "reality_private_key": "$(json_escape "${exit_reality_private_key}")",
    "reality_public_key": "$(json_escape "${exit_reality_public_key}")",
    "reality_short_id": "$(json_escape "${exit_reality_short_id}")"
  }
}
__SPEC_ENTRY_MASTER_EXIT__

  python3 "${ENTRY_MASTER_EXIT_RENDERER}" \
    "${TOPOLOGY_SPEC_FILE}" \
    "${PROFILES_DIR}" \
    "${HOST_VARS_DIR}" \
    "${TOPOLOGY_VARS_FILE}" \
    "${SUMMARY_FILE}"

  echo "Prepared: ${TOPOLOGY_SPEC_FILE}"
  echo "Prepared: ${TOPOLOGY_VARS_FILE}"
  echo "Prepared profiles in: ${PROFILES_DIR}"
  echo "Prepared summary: ${SUMMARY_FILE}"
  echo "Prepared host vars under: ${HOST_VARS_DIR}"
  echo
  echo "Next:"
  echo "  npm run ansible:run:check"
  echo "  npm run ansible:run"
  exit 0
fi

if [ "$(count_hosts "${master_hosts}")" -lt 1 ]; then
  echo "At least one master host is required in ${INVENTORY_PATH}."
  exit 1
fi

if [ "$(count_hosts "${worker_hosts}")" -lt 2 ]; then
  echo "This topology expects at least two worker hosts: edge and at least one exit."
  exit 1
fi

default_transit_host="$(first_host "${master_hosts}")"
default_edge_host="$(first_host "${worker_hosts}")"

echo "=== Remnawave topology bootstrap (XHTTP, multi-exit) ==="
echo "Profiles will be generated for:"
echo "  edge client inbound: VLESS + XHTTP + REALITY"
echo "  edge -> transit: XHTTP over TLS"
echo "  transit -> exits: XHTTP over TLS"
echo "  optional direct client ingress on selected exit workers"
echo

prompt_host_choice transit_host "Transit host (master)" "${master_hosts}" "${default_transit_host}"
prompt_host_choice edge_host "Edge host (worker)" "${worker_hosts}" "${default_edge_host}"

remaining_exit_hosts="$(printf '%s\n' "${worker_hosts}" | awk -v edge="${edge_host}" 'NF && $0 != edge')"
remaining_exit_count="$(count_hosts "${remaining_exit_hosts}")"
if [ "${remaining_exit_count}" -lt 1 ]; then
  echo "No worker hosts left for exits after selecting edge=${edge_host}."
  exit 1
fi

while true; do
  exit_count_default="1"
  if [ "${remaining_exit_count}" -lt 1 ]; then
    exit_count_default="${remaining_exit_count}"
  fi
  prompt_int exit_count "How many exit hosts to configure" "${exit_count_default}" 1 "${remaining_exit_count}"
  if [ "${exit_count}" -ge 1 ] && [ "${exit_count}" -le "${remaining_exit_count}" ]; then
    break
  fi
  echo "Exit host count must be between 1 and ${remaining_exit_count}."
done

transit_cert_domain="$(certbot_domain_for_host "${transit_host}")"
if [ -z "${transit_cert_domain}" ]; then
  echo "Could not determine certbot domain for transit host ${transit_host}."
  exit 1
fi

edge_client_port_default="${DEFAULT_EDGE_CLIENT_PORT}"
edge_reality_target_default="${DEFAULT_EDGE_REALITY_TARGET}"
edge_reality_server_name_default="${DEFAULT_EDGE_REALITY_SERVER_NAME}"
edge_cover_host_default="${DEFAULT_EDGE_XHTTP_HOST}"
edge_cover_path_default="${DEFAULT_EDGE_XHTTP_PATH}"
prompt_int edge_client_port "Client-facing port on ${edge_host}" "${edge_client_port_default}"
prompt edge_reality_target "Reality target for ${edge_host} (example: sun6-22.userapi.com:443)" "${edge_reality_target_default}"
prompt edge_reality_server_name "Reality SNI/serverName for ${edge_host}" "${edge_reality_server_name_default}"
prompt edge_cover_host "XHTTP host for client-facing inbound on ${edge_host}" "${edge_cover_host_default}"
prompt edge_cover_path "XHTTP path for client-facing inbound on ${edge_host}" "${edge_cover_path_default}"

generated_edge_private="REPLACE_REALITY_PRIVATE_KEY"
generated_edge_public="REPLACE_REALITY_PUBLIC_KEY"
edge_reality_short_id_default="$(generate_short_id)"
if generated_edge_output="$(generate_reality_keypair)"; then
  generated_edge_private="$(printf '%s\n' "${generated_edge_output}" | sed -n '1p')"
  generated_edge_public="$(printf '%s\n' "${generated_edge_output}" | sed -n '2p')"
fi
prompt edge_reality_private_key "Reality private key for ${edge_host}" "${generated_edge_private}"
prompt edge_reality_public_key "Reality public key / Password for ${edge_host} (for clients/reference)" "${generated_edge_public}"
prompt edge_reality_short_id "Reality shortId for ${edge_host}" "${edge_reality_short_id_default}"

transit_inbound_port_default="${DEFAULT_TRANSIT_INBOUND_PORT}"
transit_dial_address_default="${transit_cert_domain}"
transit_server_name_default="${transit_cert_domain}"
transit_xhttp_host_default="${transit_cert_domain}"
transit_xhttp_path_default="${DEFAULT_TRANSIT_XHTTP_PATH}"
edge_to_transit_uuid_default="REPLACE_$(placeholder_slug "${edge_host}_TO_${transit_host}")_SERVICE_UUID"
prompt_int transit_inbound_port "Transit inbound port on ${transit_host}" "${transit_inbound_port_default}"
prompt transit_dial_address "Dial address for ${edge_host} -> ${transit_host}" "${transit_dial_address_default}"
prompt transit_server_name "TLS serverName for ${edge_host} -> ${transit_host}" "${transit_server_name_default}"
prompt transit_xhttp_host "XHTTP host for ${edge_host} -> ${transit_host}" "${transit_xhttp_host_default}"
prompt transit_xhttp_path "XHTTP path for ${edge_host} -> ${transit_host}" "${transit_xhttp_path_default}"
prompt edge_to_transit_uuid "Service-user UUID for ${edge_host} -> ${transit_host} (placeholder allowed)" "${edge_to_transit_uuid_default}"

transit_direct_geoip_default="${DEFAULT_TRANSIT_DIRECT_GEOIP}"
transit_direct_ip_cidrs_default=""
transit_direct_geosite_default="${DEFAULT_TRANSIT_DIRECT_GEOSITE}"
prompt transit_direct_geoip_codes "GeoIP country codes for direct egress on ${transit_host} (comma-separated, without geoip:)" "${transit_direct_geoip_default}"
prompt transit_direct_ip_cidrs "Additional IP/CIDR rules for direct egress on ${transit_host} (comma-separated, optional)" "${transit_direct_ip_cidrs_default}"
prompt transit_direct_geosite "Geosite selectors for direct egress on ${transit_host} (comma-separated, without geosite:)" "${transit_direct_geosite_default}"

selected_exit_hosts=""
exit_entries=""
index=1
while [ "${index}" -le "${exit_count}" ]; do
  default_exit_candidate="$(nth_host "${remaining_exit_hosts}" "${index}")"
  [ -z "${default_exit_candidate}" ] && default_exit_candidate="$(first_host "${remaining_exit_hosts}")"

  while true; do
    prompt_host_choice exit_host "Exit host #${index} (worker)" "${remaining_exit_hosts}" "${default_exit_candidate}"
    if contains_host "${exit_host}" "${selected_exit_hosts}"; then
      echo "Host '${exit_host}' is already selected as an exit."
      continue
    fi
    break
  done

  exit_cert_domain="$(certbot_domain_for_host "${exit_host}")"
  if [ -z "${exit_cert_domain}" ]; then
    echo "Could not determine certbot domain for exit host ${exit_host}."
    exit 1
  fi

  exit_slug="$(sanitize_slug "${exit_host}")"
  exit_placeholder="$(placeholder_slug "${exit_host}")"
  exit_inbound_port_default="$((DEFAULT_EXIT_BASE_INBOUND_PORT + index))"
  exit_dial_address_default="${exit_cert_domain}"
  exit_server_name_default="${exit_cert_domain}"
  exit_xhttp_host_default="${exit_cert_domain}"
  exit_xhttp_path_default="${DEFAULT_EXIT_XHTTP_PATH}"
  transit_to_exit_uuid_default="REPLACE_${exit_placeholder}_SERVICE_UUID"
  exit_route_geoip_codes_default=""
  exit_route_ip_cidrs_default=""
  exit_route_geosite_default=""
  exit_enable_direct_default="${DEFAULT_EXIT_DIRECT_ENABLED}"
  exit_direct_port_default="${DEFAULT_EXIT_DIRECT_PORT}"
  exit_direct_target_default="${DEFAULT_EXIT_DIRECT_TARGET}"
  exit_direct_server_name_default="${DEFAULT_EXIT_DIRECT_SERVER_NAME}"
  exit_direct_cover_host_default="${DEFAULT_EXIT_DIRECT_XHTTP_HOST}"
  exit_direct_cover_path_default="${DEFAULT_EXIT_DIRECT_XHTTP_PATH}"

  prompt_int exit_inbound_port "Transit inbound port on ${exit_host}" "${exit_inbound_port_default}"
  prompt exit_dial_address "Dial address for ${transit_host} -> ${exit_host}" "${exit_dial_address_default}"
  prompt exit_server_name "TLS serverName for ${transit_host} -> ${exit_host}" "${exit_server_name_default}"
  prompt exit_xhttp_host "XHTTP host for ${transit_host} -> ${exit_host}" "${exit_xhttp_host_default}"
  prompt exit_xhttp_path "XHTTP path for ${transit_host} -> ${exit_host}" "${exit_xhttp_path_default}"
  prompt transit_to_exit_uuid "Service-user UUID for ${transit_host} -> ${exit_host} (placeholder allowed)" "${transit_to_exit_uuid_default}"

  prompt exit_route_geoip_codes "GeoIP country codes for routing from ${transit_host} to ${exit_host} (comma-separated, optional)" "${exit_route_geoip_codes_default}"
  prompt exit_route_ip_cidrs "Additional IP/CIDR rules for routing from ${transit_host} to ${exit_host} (comma-separated, optional)" "${exit_route_ip_cidrs_default}"
  prompt exit_route_geosite "Geosite selectors for routing from ${transit_host} to ${exit_host} (comma-separated, optional)" "${exit_route_geosite_default}"

  prompt_bool exit_enable_direct "Enable direct client ingress on ${exit_host}?" "${exit_enable_direct_default}"
  exit_direct_port=0
  exit_direct_target=""
  exit_direct_server_name=""
  exit_direct_cover_host=""
  exit_direct_cover_path=""
  exit_direct_private_key=""
  exit_direct_public_key=""
  exit_direct_short_id=""

  if [ "${exit_enable_direct}" = "true" ]; then
    prompt_int exit_direct_port "Direct client port on ${exit_host}" "${exit_direct_port_default}"
    if [ "${exit_direct_port}" = "${exit_inbound_port}" ]; then
      echo "Direct client port and transit inbound port on ${exit_host} must be different."
      exit 1
    fi

    generated_direct_private="REPLACE_REALITY_PRIVATE_KEY"
    generated_direct_public="REPLACE_REALITY_PUBLIC_KEY"
    exit_direct_short_id_default="$(generate_short_id)"
    if generated_direct_output="$(generate_reality_keypair)"; then
      generated_direct_private="$(printf '%s\n' "${generated_direct_output}" | sed -n '1p')"
      generated_direct_public="$(printf '%s\n' "${generated_direct_output}" | sed -n '2p')"
    fi

    prompt exit_direct_target "Reality target for direct clients on ${exit_host}" "${exit_direct_target_default}"
    prompt exit_direct_server_name "Reality SNI/serverName for direct clients on ${exit_host}" "${exit_direct_server_name_default}"
    prompt exit_direct_cover_host "XHTTP host for direct clients on ${exit_host}" "${exit_direct_cover_host_default}"
    prompt exit_direct_cover_path "XHTTP path for direct clients on ${exit_host}" "${exit_direct_cover_path_default}"
    prompt exit_direct_private_key "Reality private key for direct clients on ${exit_host}" "${generated_direct_private}"
    prompt exit_direct_public_key "Reality public key / Password for direct clients on ${exit_host}" "${generated_direct_public}"
    prompt exit_direct_short_id "Reality shortId for direct clients on ${exit_host}" "${exit_direct_short_id_default}"
  fi

  if [ -n "${selected_exit_hosts}" ]; then
    selected_exit_hosts+=$'\n'
  fi
  selected_exit_hosts+="${exit_host}"

  exit_entry="$(cat <<EOF
    {
      "index": ${index},
      "host": "$(json_escape "${exit_host}")",
      "slug": "$(json_escape "${exit_slug}")",
      "cert_domain": "$(json_escape "${exit_cert_domain}")",
      "inbound_port": ${exit_inbound_port},
      "dial_address": "$(json_escape "${exit_dial_address}")",
      "server_name": "$(json_escape "${exit_server_name}")",
      "xhttp_host": "$(json_escape "${exit_xhttp_host}")",
      "xhttp_path": "$(json_escape "${exit_xhttp_path}")",
      "service_uuid": "$(json_escape "${transit_to_exit_uuid}")",
      "route_geoip_codes": [$(csv_to_json_array "${exit_route_geoip_codes}")],
      "route_ip_cidrs": [$(csv_to_json_array "${exit_route_ip_cidrs}")],
      "route_geosite": [$(csv_to_json_array "${exit_route_geosite}")],
      "direct": {
        "enabled": ${exit_enable_direct},
        "client_port": ${exit_direct_port},
        "reality_target": "$(json_escape "${exit_direct_target}")",
        "reality_server_name": "$(json_escape "${exit_direct_server_name}")",
        "cover_host": "$(json_escape "${exit_direct_cover_host}")",
        "cover_path": "$(json_escape "${exit_direct_cover_path}")",
        "reality_private_key": "$(json_escape "${exit_direct_private_key}")",
        "reality_public_key": "$(json_escape "${exit_direct_public_key}")",
        "reality_short_id": "$(json_escape "${exit_direct_short_id}")"
      }
    }
EOF
)"
  if [ -n "${exit_entries}" ]; then
    exit_entries+=$',\n'
  fi
  exit_entries+="${exit_entry}"

  index=$((index + 1))
done

default_exit_host="$(first_host "${selected_exit_hosts}")"
prompt_host_choice default_exit_host "Default non-RU exit host" "${selected_exit_hosts}" "${default_exit_host}"

cat > "${TOPOLOGY_SPEC_FILE}" <<__SPEC__
{
  "edge": {
    "host": "$(json_escape "${edge_host}")",
    "client_port": ${edge_client_port},
    "reality_target": "$(json_escape "${edge_reality_target}")",
    "reality_server_name": "$(json_escape "${edge_reality_server_name}")",
    "cover_host": "$(json_escape "${edge_cover_host}")",
    "cover_path": "$(json_escape "${edge_cover_path}")",
    "reality_private_key": "$(json_escape "${edge_reality_private_key}")",
    "reality_public_key": "$(json_escape "${edge_reality_public_key}")",
    "reality_short_id": "$(json_escape "${edge_reality_short_id}")",
    "to_transit_uuid": "$(json_escape "${edge_to_transit_uuid}")"
  },
  "transit": {
    "host": "$(json_escape "${transit_host}")",
    "cert_domain": "$(json_escape "${transit_cert_domain}")",
    "inbound_port": ${transit_inbound_port},
    "dial_address": "$(json_escape "${transit_dial_address}")",
    "server_name": "$(json_escape "${transit_server_name}")",
    "xhttp_host": "$(json_escape "${transit_xhttp_host}")",
    "xhttp_path": "$(json_escape "${transit_xhttp_path}")",
    "direct_geoip_codes": [$(csv_to_json_array "${transit_direct_geoip_codes}")],
    "direct_ip_cidrs": [$(csv_to_json_array "${transit_direct_ip_cidrs}")],
    "direct_geosite": [$(csv_to_json_array "${transit_direct_geosite}")]
  },
  "default_exit_host": "$(json_escape "${default_exit_host}")",
  "exits": [
${exit_entries}
  ]
}
__SPEC__

python3 - "${TOPOLOGY_SPEC_FILE}" "${PROFILES_DIR}" "${HOST_VARS_DIR}" "${TOPOLOGY_VARS_FILE}" "${SUMMARY_FILE}" <<'__PY_RENDER__'
import json
import sys
from pathlib import Path

spec_path = Path(sys.argv[1])
profiles_dir = Path(sys.argv[2])
host_vars_dir = Path(sys.argv[3])
topology_vars_file = Path(sys.argv[4])
summary_file = Path(sys.argv[5])

spec = json.loads(spec_path.read_text(encoding="utf-8"))
profiles_dir.mkdir(parents=True, exist_ok=True)
host_vars_dir.mkdir(parents=True, exist_ok=True)


def clean_list(values):
    return [value for value in values if value]


def xhttp_reality_inbound(tag, port, target, server_name, private_key, short_id, host, path):
    return {
        "tag": tag,
        "listen": "0.0.0.0",
        "port": int(port),
        "protocol": "vless",
        "settings": {"clients": [], "decryption": "none"},
        "sniffing": {"enabled": True, "destOverride": ["http", "tls", "quic", "fakedns"]},
        "streamSettings": {
            "network": "xhttp",
            "security": "reality",
            "realitySettings": {
                "show": False,
                "target": target,
                "xver": 0,
                "serverNames": [server_name],
                "privateKey": private_key,
                "shortIds": [short_id],
            },
            "xhttpSettings": {
                "host": host,
                "path": path,
                "mode": "auto",
                "scMaxBufferedPosts": 30,
                "scMaxEachPostBytes": "1000000",
                "scStreamUpServerSecs": "20-80",
                "xPaddingBytes": "100-1000",
            },
        },
    }


def xhttp_reality_inbound_minimal(tag, port, target, server_name, private_key, short_id, path):
    return {
        "tag": tag,
        "listen": "0.0.0.0",
        "port": int(port),
        "protocol": "vless",
        "settings": {"clients": [], "decryption": "none"},
        "sniffing": {"enabled": True, "destOverride": ["http", "tls", "quic"]},
        "streamSettings": {
            "network": "xhttp",
            "security": "reality",
            "xhttpSettings": {
                "path": path,
            },
            "realitySettings": {
                "show": False,
                "target": target,
                "xver": 0,
                "serverNames": [server_name],
                "privateKey": private_key,
                "shortIds": [short_id],
            },
        },
    }


def xhttp_tls_inbound(tag, port, cert_domain, host, path):
    return {
        "tag": tag,
        "listen": "0.0.0.0",
        "port": int(port),
        "protocol": "vless",
        "settings": {
            "clients": [],
            "decryption": "none",
        },
        "sniffing": {"enabled": True, "destOverride": ["http", "tls", "quic", "fakedns"]},
        "streamSettings": {
            "network": "xhttp",
            "security": "tls",
            "tlsSettings": {
                "serverName": cert_domain,
                "alpn": ["h2", "http/1.1"],
                "certificates": [
                    {
                        "certificateFile": f"/etc/letsencrypt/live/{cert_domain}/fullchain.pem",
                        "keyFile": f"/etc/letsencrypt/live/{cert_domain}/privkey.pem",
                    }
                ],
            },
            "xhttpSettings": {"host": host, "path": path, "mode": "stream-one"},
        },
    }


def xhttp_tls_outbound(tag, address, port, client_uuid, server_name, host, path):
    return {
        "tag": tag,
        "protocol": "vless",
        "settings": {
            "vnext": [
                {
                    "address": address,
                    "port": int(port),
                    "users": [{"id": client_uuid, "flow": "", "encryption": "none"}],
                }
            ]
        },
        "streamSettings": {
            "network": "xhttp",
            "security": "tls",
            "tlsSettings": {
                "serverName": server_name,
                "alpn": ["h2", "http/1.1"],
                "fingerprint": "chrome",
                "allowInsecure": False,
            },
            "xhttpSettings": {"host": host, "path": path, "mode": "stream-one"},
        },
    }


def base_dns_rule():
    return {"type": "field", "port": "53", "network": "TCP,UDP", "outboundTag": "LOCAL_DNS"}


def local_dns_config():
    return {
        "servers": [
            {
                "address": "127.0.0.1",
                "port": 53,
                "domains": [],
                "expectIPs": [],
                "unexpectedIPs": [],
                "queryStrategy": "UseIPv4",
                "skipFallback": True,
                "disableCache": False,
                "finalQuery": False,
            }
        ],
        "queryStrategy": "UseIP",
        "tag": "dns_inbound",
    }


def private_block_rule():
    return {"type": "field", "ip": ["geoip:private"], "outboundTag": "BLOCK"}


def bittorrent_block_rule():
    return {"type": "field", "protocol": ["bittorrent"], "outboundTag": "BLOCK"}


def network_rule(tag):
    return {"type": "field", "network": "TCP,UDP", "outboundTag": tag}


def emit_yaml(value, indent=0):
    pad = "  " * indent
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}{key}:")
                lines.append(emit_yaml(item, indent + 1))
            elif isinstance(item, bool):
                lines.append(f"{pad}{key}: {'true' if item else 'false'}")
            elif item is None:
                lines.append(f"{pad}{key}: null")
            elif isinstance(item, (int, float)):
                lines.append(f"{pad}{key}: {item}")
            else:
                escaped = str(item).replace('"', '\\"')
                lines.append(f'{pad}{key}: "{escaped}"')
        return "\n".join(lines)
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}-")
                lines.append(emit_yaml(item, indent + 1))
            elif isinstance(item, bool):
                lines.append(f"{pad}- {'true' if item else 'false'}")
            elif item is None:
                lines.append(f"{pad}- null")
            elif isinstance(item, (int, float)):
                lines.append(f"{pad}- {item}")
            else:
                escaped = str(item).replace('"', '\\"')
                lines.append(f'{pad}- "{escaped}"')
        return "\n".join(lines)
    return f"{pad}{value}"


def write_json(path: Path, data: dict):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


edge = spec["edge"]
transit = spec["transit"]
default_exit_host = spec["default_exit_host"]
exits = spec["exits"]

if not exits:
    raise SystemExit("At least one exit host is required")

exit_by_host = {entry["host"]: entry for entry in exits}
if default_exit_host not in exit_by_host:
    raise SystemExit(f"Default exit host '{default_exit_host}' is missing from exits")

for entry in exits:
    route_ip = clean_list(entry.get("route_geoip_codes", [])) or clean_list(entry.get("route_ip_cidrs", []))
    route_domain = clean_list(entry.get("route_geosite", []))
    entry["used_by_transit"] = bool(route_ip or route_domain or entry["host"] == default_exit_host)
    if not entry["used_by_transit"] and not entry["direct"].get("enabled"):
        raise SystemExit(
            f"Exit host '{entry['host']}' is neither used by transit routing nor exposed for direct clients"
        )

host_ports = {
    edge["host"]: {"roles": ["edge"], "ports": [int(edge["client_port"])]},
    transit["host"]: {"roles": ["transit"], "ports": [int(transit["inbound_port"])]},
}
for entry in exits:
    meta = host_ports.setdefault(entry["host"], {"roles": [], "ports": []})
    if entry["used_by_transit"]:
        if "exit" not in meta["roles"]:
            meta["roles"].append("exit")
        meta["ports"].append(int(entry["inbound_port"]))
    if entry["direct"].get("enabled"):
        if "direct" not in meta["roles"]:
            meta["roles"].append("direct")
        meta["ports"].append(int(entry["direct"]["client_port"]))

for host, meta in host_ports.items():
    ports = [int(port) for port in meta["ports"]]
    if len(ports) != len(set(ports)):
        raise SystemExit(f"Duplicate TCP ports detected for host '{host}': {ports}")

edge_profile = {
    "log": {"loglevel": "warning"},
    "dns": local_dns_config(),
    "inbounds": [
        xhttp_reality_inbound(
            tag="EDGE_CLIENT_IN",
            port=edge["client_port"],
            target=edge["reality_target"],
            server_name=edge["reality_server_name"],
            private_key=edge["reality_private_key"],
            short_id=edge["reality_short_id"],
            host=edge["cover_host"],
            path=edge["cover_path"],
        )
    ],
    "outbounds": [
        xhttp_tls_outbound(
            tag="TO_TRANSIT",
            address=transit["dial_address"],
            port=transit["inbound_port"],
            client_uuid=edge["to_transit_uuid"],
            server_name=transit["server_name"],
            host=transit["xhttp_host"],
            path=transit["xhttp_path"],
        ),
        {"tag": "LOCAL_DNS", "protocol": "freedom", "settings": {"redirect": "127.0.0.1:53"}},
        {"tag": "BLOCK", "protocol": "blackhole", "settings": {}},
    ],
    "routing": {
        "domainStrategy": "AsIs",
        "rules": [
            base_dns_rule(),
            private_block_rule(),
            bittorrent_block_rule(),
            network_rule("TO_TRANSIT"),
        ],
    },
}

transit_outbounds = [
    {"tag": "RU_DIRECT", "protocol": "freedom", "settings": {"domainStrategy": "UseIPv4"}},
    {"tag": "LOCAL_DNS", "protocol": "freedom", "settings": {"redirect": "127.0.0.1:53"}},
    {"tag": "BLOCK", "protocol": "blackhole", "settings": {}},
]
for entry in exits:
    entry["outbound_tag"] = f"TO_{entry['slug'].upper().replace('-', '_')}_EXIT"
    if entry["used_by_transit"]:
        transit_outbounds.append(
            xhttp_tls_outbound(
                tag=entry["outbound_tag"],
                address=entry["dial_address"],
                port=entry["inbound_port"],
                client_uuid=entry["service_uuid"],
                server_name=entry["server_name"],
                host=entry["xhttp_host"],
                path=entry["xhttp_path"],
            )
        )

transit_rules = [base_dns_rule(), private_block_rule(), bittorrent_block_rule()]
ru_ip_entries = [f"geoip:{code}" for code in clean_list(transit.get("direct_geoip_codes", []))]
ru_ip_entries.extend(clean_list(transit.get("direct_ip_cidrs", [])))
if ru_ip_entries:
    transit_rules.append({"type": "field", "ip": ru_ip_entries, "outboundTag": "RU_DIRECT"})
ru_domain_entries = [f"geosite:{value}" for value in clean_list(transit.get("direct_geosite", []))]
if ru_domain_entries:
    transit_rules.append({"type": "field", "domain": ru_domain_entries, "outboundTag": "RU_DIRECT"})

for entry in exits:
    if not entry["used_by_transit"]:
        continue
    if entry["host"] == default_exit_host:
        continue
    route_ip_entries = [f"geoip:{code}" for code in clean_list(entry.get("route_geoip_codes", []))]
    route_ip_entries.extend(clean_list(entry.get("route_ip_cidrs", [])))
    if route_ip_entries:
        transit_rules.append({"type": "field", "ip": route_ip_entries, "outboundTag": entry["outbound_tag"]})
    route_domain_entries = [f"geosite:{value}" for value in clean_list(entry.get("route_geosite", []))]
    if route_domain_entries:
        transit_rules.append({"type": "field", "domain": route_domain_entries, "outboundTag": entry["outbound_tag"]})

transit_rules.append(network_rule(exit_by_host[default_exit_host]["outbound_tag"]))
transit_profile = {
    "log": {"loglevel": "warning"},
    "dns": local_dns_config(),
    "inbounds": [
        xhttp_tls_inbound(
            tag="FROM_EDGE",
            port=transit["inbound_port"],
            cert_domain=transit["cert_domain"],
            host=transit["xhttp_host"],
            path=transit["xhttp_path"],
        )
    ],
    "outbounds": transit_outbounds,
    "routing": {"domainStrategy": "AsIs", "rules": transit_rules},
}

profile_files = []
edge_profile_file = profiles_dir / f"01-edge-{edge['host']}.profile.json"
transit_profile_file = profiles_dir / f"02-transit-{transit['host']}.profile.json"
write_json(edge_profile_file, edge_profile)
write_json(transit_profile_file, transit_profile)
profile_files.extend([edge_profile_file, transit_profile_file])

exit_summaries = []
for idx, entry in enumerate(exits, start=1):
    inbounds = []
    if entry["used_by_transit"]:
        inbounds.append(
            xhttp_tls_inbound(
                tag="FROM_TRANSIT",
                port=entry["inbound_port"],
                cert_domain=entry["cert_domain"],
                host=entry["xhttp_host"],
                path=entry["xhttp_path"],
            )
        )
    direct = entry["direct"]
    if direct.get("enabled"):
        inbounds.append(
            xhttp_reality_inbound_minimal(
                tag="DIRECT_CLIENT_IN",
                port=direct["client_port"],
                target=direct["reality_target"],
                server_name=direct["reality_server_name"],
                private_key=direct["reality_private_key"],
                short_id=direct["reality_short_id"],
                path=direct["cover_path"],
            )
        )

    exit_profile = {
        "log": {"loglevel": "warning"},
        "dns": local_dns_config(),
        "inbounds": inbounds,
        "outbounds": [
            {"tag": "EGRESS", "protocol": "freedom", "settings": {"domainStrategy": "UseIPv4"}},
            {"tag": "LOCAL_DNS", "protocol": "freedom", "settings": {"redirect": "127.0.0.1:53"}},
            {"tag": "BLOCK", "protocol": "blackhole", "settings": {}},
        ],
        "routing": {
            "domainStrategy": "AsIs",
            "rules": [base_dns_rule(), private_block_rule(), bittorrent_block_rule(), network_rule("EGRESS")],
        },
    }

    exit_profile_file = profiles_dir / f"{idx + 2:02d}-exit-{entry['host']}.profile.json"
    write_json(exit_profile_file, exit_profile)
    profile_files.append(exit_profile_file)
    exit_summaries.append(
        {
            "host": entry["host"],
            "default": entry["host"] == default_exit_host,
            "used_by_transit": entry["used_by_transit"],
            "transit_inbound_port": int(entry["inbound_port"]) if entry["used_by_transit"] else None,
            "route_geoip_codes": clean_list(entry.get("route_geoip_codes", [])),
            "route_ip_cidrs": clean_list(entry.get("route_ip_cidrs", [])),
            "route_geosite": clean_list(entry.get("route_geosite", [])),
            "direct_enabled": bool(direct.get("enabled")),
            "direct_client_port": int(direct["client_port"]) if direct.get("enabled") else None,
            "direct_reality_public_key": direct.get("reality_public_key", "") if direct.get("enabled") else "",
            "direct_reality_short_id": direct.get("reality_short_id", "") if direct.get("enabled") else "",
            "direct_reality_server_name": direct.get("reality_server_name", "") if direct.get("enabled") else "",
            "direct_cover_host": direct.get("cover_host", "") if direct.get("enabled") else "",
            "direct_cover_path": direct.get("cover_path", "") if direct.get("enabled") else "",
        }
    )

for host, meta in host_ports.items():
    meta["roles"] = sorted(set(meta["roles"]))
    meta["ports"] = sorted(set(int(port) for port in meta["ports"]))
    host_dir = host_vars_dir / host
    host_dir.mkdir(parents=True, exist_ok=True)
    host_file = host_dir / "remnawave_topology.yml"
    host_file.write_text(
        emit_yaml(
            {
                "remnawave_topology_roles": meta["roles"],
                "firewall_extra_tcp_ports": meta["ports"],
            }
        )
        + "\n",
        encoding="utf-8",
    )

summary_data = {
    "edge": {
        "host": edge["host"],
        "client_port": int(edge["client_port"]),
        "reality_public_key": edge["reality_public_key"],
        "reality_short_id": edge["reality_short_id"],
        "reality_server_name": edge["reality_server_name"],
        "cover_host": edge["cover_host"],
        "cover_path": edge["cover_path"],
    },
    "transit": {
        "host": transit["host"],
        "cert_domain": transit["cert_domain"],
        "inbound_port": int(transit["inbound_port"]),
        "direct_geoip_codes": clean_list(transit.get("direct_geoip_codes", [])),
        "direct_ip_cidrs": clean_list(transit.get("direct_ip_cidrs", [])),
        "direct_geosite": clean_list(transit.get("direct_geosite", [])),
    },
    "default_exit_host": default_exit_host,
    "exits": exit_summaries,
}
topology_vars_file.write_text(emit_yaml(summary_data) + "\n", encoding="utf-8")

summary_lines = [
    "# Remnawave topology bootstrap",
    "",
    "## Hosts",
    "",
    f"- edge: {edge['host']}",
    f"- transit: {transit['host']}",
]
for entry in exit_summaries:
    flags = []
    if entry["default"]:
        flags.append("default")
    if entry["direct_enabled"]:
        flags.append("direct")
    suffix = f" ({', '.join(flags)})" if flags else ""
    summary_lines.append(f"- exit: {entry['host']}{suffix}")

summary_lines.extend(["", "## Ports to open via Ansible", ""])
summary_lines.append(f"- {edge['host']}: {edge['client_port']}/tcp")
summary_lines.append(f"- {transit['host']}: {transit['inbound_port']}/tcp")
for entry in exit_summaries:
    if entry["used_by_transit"]:
        summary_lines.append(f"- {entry['host']}: {entry['transit_inbound_port']}/tcp (transit inbound)")
    if entry["direct_enabled"]:
        summary_lines.append(f"- {entry['host']}: {entry['direct_client_port']}/tcp (direct client ingress)")

summary_lines.extend([
    "",
    "## Edge client values",
    "",
    f"- Reality public key: {edge['reality_public_key']}",
    f"- Reality shortId: {edge['reality_short_id']}",
    f"- Reality serverName: {edge['reality_server_name']}",
    f"- XHTTP host: {edge['cover_host']}",
    f"- XHTTP path: {edge['cover_path']}",
    "",
    "## Transit routing",
    "",
    f"- direct geoip codes: {summary_data['transit']['direct_geoip_codes'] or ['none']}",
    f"- direct ip/cidr rules: {summary_data['transit']['direct_ip_cidrs'] or ['none']}",
    f"- direct geosite selectors: {summary_data['transit']['direct_geosite'] or ['none']}",
    f"- default exit: {default_exit_host}",
    "",
    "## Exit routing",
    "",
])
for entry in exit_summaries:
    summary_lines.append(
        f"- {entry['host']}: used_by_transit={entry['used_by_transit']}, "
        f"geoip={entry['route_geoip_codes'] or ['none']}, "
        f"ip_cidrs={entry['route_ip_cidrs'] or ['none']}, "
        f"geosite={entry['route_geosite'] or ['none']}"
    )
    if entry['direct_enabled']:
        summary_lines.append(
            f"- {entry['host']} direct ingress: port={entry['direct_client_port']}, "
            f"public_key={entry['direct_reality_public_key']}, shortId={entry['direct_reality_short_id']}"
        )

summary_lines.extend(["", "## Generated profiles", ""])
for path in profile_files:
    summary_lines.append(f"- {path}")

summary_lines.extend(["", "## Manual follow-up", ""])
summary_lines.append(f"1. Create one service user for {edge['host']} -> {transit['host']}.")
service_index = 2
for entry in exit_summaries:
    if entry["used_by_transit"]:
        summary_lines.append(f"{service_index}. Create one service user for {transit['host']} -> {entry['host']}.")
        service_index += 1
summary_lines.append(f"{service_index}. Replace placeholder UUIDs in generated profiles if you left REPLACE_* values.")
summary_lines.append(f"{service_index + 1}. Import the JSON files into Remnawave Config Profiles and bind them to the corresponding nodes.")
summary_lines.append(f"{service_index + 2}. Apply firewall changes and node deploy:")
summary_lines.append("   - npm run ansible:run:check")
summary_lines.append("   - npm run ansible:run")
summary_file.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
__PY_RENDER__

echo "Prepared: ${TOPOLOGY_SPEC_FILE}"
echo "Prepared: ${TOPOLOGY_VARS_FILE}"
echo "Prepared profiles in: ${PROFILES_DIR}"
echo "Prepared summary: ${SUMMARY_FILE}"
echo "Prepared host vars under: ${HOST_VARS_DIR}"
echo
echo "Next:"
echo "  npm run ansible:run:check"
echo "  npm run ansible:run"
