#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AUDIT_ENV="${REMNAWAVE_AUDIT_ENV:-${ROOT_DIR}/.private/remnawave-self-steal/audit.env}"

if [ -f "${AUDIT_ENV}" ]; then
  # shellcheck disable=SC1090
  source "${AUDIT_ENV}"
fi

SUBSCRIPTION_URL="${REMNAWAVE_SUBSCRIPTION_URL:-}"
TIMEOUT="${REMNAWAVE_AUDIT_TIMEOUT:-10}"
MOSCOW_SUBSCRIPTION_ADDRESS="${REMNAWAVE_AUDIT_MOSCOW_ADDRESS:-@5.42.111.142:10443}"
MOSCOW_SUBSCRIPTION_SNI="${REMNAWAVE_AUDIT_MOSCOW_SNI:-sub.moscow.himenkov.ru}"

FAILURES=0
TMP_DIR="$(mktemp -d)"
SUB_RAW="${TMP_DIR}/subscription.raw"
SUB_DECODED="${TMP_DIR}/subscription.decoded"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

section() {
  printf '\n== %s ==\n' "$1"
}

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

warn() {
  printf 'WARN %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "required command not found: $1"
    return 1
  fi
}

check_http_status() {
  local label="$1"
  local resolve="$2"
  local url="$3"
  local code

  if [ -n "${resolve}" ]; then
    code="$(curl -kfsS --max-time "${TIMEOUT}" --resolve "${resolve}" -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null)"
  else
    code="$(curl -kfsS --max-time "${TIMEOUT}" -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null)"
  fi

  if [ "${code}" = "200" ]; then
    pass "${label}: HTTP 200"
  else
    fail "${label}: expected HTTP 200, got '${code:-curl failed}'"
  fi
}

check_headers_clean() {
  local label="$1"
  local resolve="$2"
  local url="$3"
  local headers="${TMP_DIR}/${label//[^a-zA-Z0-9]/_}.headers"

  if [ -n "${resolve}" ]; then
    if ! curl -kIsS --max-time "${TIMEOUT}" --resolve "${resolve}" "${url}" >"${headers}" 2>/dev/null; then
      fail "${label}: failed to fetch response headers"
      return
    fi
  else
    if ! curl -kIsS --max-time "${TIMEOUT}" "${url}" >"${headers}" 2>/dev/null; then
      fail "${label}: failed to fetch response headers"
      return
    fi
  fi

  if grep -Eiq 'apple|yandex|cloudcdn|borsa|userapi' "${headers}"; then
    fail "${label}: response headers contain old camouflage markers"
  else
    pass "${label}: response headers are clean"
  fi
}

json_value() {
  local file="$1"
  local expr="$2"
  jq -r "${expr}" "${file}"
}

check_json_value() {
  local label="$1"
  local file="$2"
  local expr="$3"
  local expected="$4"
  local actual

  actual="$(json_value "${file}" "${expr}" 2>/dev/null)"
  if [ "${actual}" = "${expected}" ]; then
    pass "${label}: ${expected}"
  else
    fail "${label}: expected '${expected}', got '${actual}'"
  fi
}

check_json_array_contains() {
  local label="$1"
  local file="$2"
  local expr="$3"
  local expected="$4"
  local actual

  actual="$(json_value "${file}" "${expr}" 2>/dev/null)"
  if printf '%s\n' "${actual}" | grep -Fxq "${expected}"; then
    pass "${label}: contains ${expected}"
  else
    fail "${label}: expected array to contain '${expected}', got '${actual}'"
  fi
}

decode_subscription() {
  if base64 --decode "${SUB_RAW}" >"${SUB_DECODED}" 2>/dev/null; then
    return 0
  fi

  if base64 -D -i "${SUB_RAW}" -o "${SUB_DECODED}" 2>/dev/null; then
    return 0
  fi

  cp "${SUB_RAW}" "${SUB_DECODED}"
}

line_for_remark() {
  local remark="$1"
  grep -E "#${remark}$" "${SUB_DECODED}" | head -n 1
}

query_param() {
  local line="$1"
  local key="$2"
  printf '%s\n' "${line}" | sed -n "s/.*[?&]${key}=\\([^&#]*\\).*/\\1/p"
}

check_subscription_line() {
  local label="$1"
  local remark="$2"
  local expected_address="$3"
  local expected_sni="$4"
  local allowed_sids="$5"
  local line
  local actual_sid

  line="$(line_for_remark "${remark}")"
  if [ -z "${line}" ]; then
    fail "subscription ${label}: link not found"
    return
  fi

  case "${line}" in
    *"${expected_address}"*) pass "subscription ${label}: address ${expected_address}" ;;
    *) fail "subscription ${label}: expected address ${expected_address}" ;;
  esac

  case "${line}" in
    *"sni=${expected_sni}"*) pass "subscription ${label}: sni ${expected_sni}" ;;
    *) fail "subscription ${label}: expected sni ${expected_sni}" ;;
  esac

  actual_sid="$(query_param "${line}" "sid")"
  case "|${allowed_sids}|" in
    *"|${actual_sid}|"*) pass "subscription ${label}: shortId ${actual_sid}" ;;
    *) fail "subscription ${label}: unexpected shortId '${actual_sid}', allowed '${allowed_sids}'" ;;
  esac
}

section "Tooling"
require_cmd curl
require_cmd jq
require_cmd base64

section "Public fallback"
check_http_status "sub.moscow.himenkov.ru root" "sub.moscow.himenkov.ru:443:5.42.111.142" "https://sub.moscow.himenkov.ru/"
check_http_status "moscow.himenkov.ru root" "moscow.himenkov.ru:443:5.42.111.142" "https://moscow.himenkov.ru/"
check_http_status "MOSCOW 10443 fallback" "sub.moscow.himenkov.ru:10443:5.42.111.142" "https://sub.moscow.himenkov.ru:10443/"
check_http_status "DIRECT MOSCOW 20443 fallback" "sub.moscow.himenkov.ru:20443:5.42.111.142" "https://sub.moscow.himenkov.ru:20443/"
check_http_status "WHITE LIST PRO fallback" "pro.himenkov.ru:443:84.201.141.43" "https://pro.himenkov.ru/"
check_http_status "AMSTERDAM fallback" "himenkov.ru:443:109.234.34.227" "https://himenkov.ru/"
check_http_status "HOME fallback" "home.himenkov.ru:443:95.31.244.3" "https://home.himenkov.ru/"

section "Header camouflage"
check_headers_clean "MOSCOW 10443 fallback" "sub.moscow.himenkov.ru:10443:5.42.111.142" "https://sub.moscow.himenkov.ru:10443/"
check_headers_clean "moscow.himenkov.ru root" "moscow.himenkov.ru:443:5.42.111.142" "https://moscow.himenkov.ru/"
check_headers_clean "DIRECT MOSCOW 20443 fallback" "sub.moscow.himenkov.ru:20443:5.42.111.142" "https://sub.moscow.himenkov.ru:20443/"
check_headers_clean "WHITE LIST PRO fallback" "pro.himenkov.ru:443:84.201.141.43" "https://pro.himenkov.ru/"
check_headers_clean "AMSTERDAM fallback" "himenkov.ru:443:109.234.34.227" "https://himenkov.ru/"
check_headers_clean "HOME fallback" "home.himenkov.ru:443:95.31.244.3" "https://home.himenkov.ru/"

section "Local config files"
check_json_value "ENTRY_NODE dest" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.realitySettings.dest' "127.0.0.1:9443"
check_json_value "ENTRY_NODE serverName" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.realitySettings.serverNames[0]' "pro.himenkov.ru"
check_json_value "MASTER MOSCOW target" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.target' "127.0.0.1:443"
check_json_value "MASTER MOSCOW serverName" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.serverNames[0]' "sub.moscow.himenkov.ru"
check_json_array_contains "MASTER MOSCOW 443 SNI" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.serverNames[]' "moscow.himenkov.ru"
check_json_value "MASTER DIRECT target" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT_MSK") | .streamSettings.realitySettings.target' "127.0.0.1:443"
check_json_value "MASTER DIRECT serverName" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT_MSK") | .streamSettings.realitySettings.serverNames[0]' "sub.moscow.himenkov.ru"
check_json_value "EXIT_NODE target" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.realitySettings.target' "127.0.0.1:9443"
check_json_value "EXIT_NODE serverName" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.realitySettings.serverNames[0]' "himenkov.ru"
check_json_value "HOME_EXIT_NODE target" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_HOME_REALITY_DIRECT") | .streamSettings.realitySettings.target' "127.0.0.1:9443"
check_json_value "HOME_EXIT_NODE serverName" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_HOME_REALITY_DIRECT") | .streamSettings.realitySettings.serverNames[0]' "home.himenkov.ru"

section "Subscription"
if [ -z "${SUBSCRIPTION_URL}" ]; then
  fail "REMNAWAVE_SUBSCRIPTION_URL is not set. Put it into ${AUDIT_ENV}"
else
  if curl -fsSL --max-time "${TIMEOUT}" "${SUBSCRIPTION_URL}" >"${SUB_RAW}" 2>/dev/null; then
    decode_subscription
    entry_sids="$(json_value "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.realitySettings.shortIds | join("|")')"
    moscow_sids="$(json_value "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.shortIds | join("|")')"
    direct_moscow_sids="$(json_value "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT_MSK") | .streamSettings.realitySettings.shortIds | join("|")')"
    exit_sids="$(json_value "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.realitySettings.shortIds | join("|")')"

    check_subscription_line "MOSCOW" "MOSCOW" "${MOSCOW_SUBSCRIPTION_ADDRESS}" "${MOSCOW_SUBSCRIPTION_SNI}" "${moscow_sids}"
    check_subscription_line "DIRECT MOSCOW" "DIRECT%20MOSCOW" "@5.42.111.142:20443" "sub.moscow.himenkov.ru" "${direct_moscow_sids}"
    check_subscription_line "AMSTERDAM" "AMSTERDAM" "@109.234.34.227:443" "himenkov.ru" "${exit_sids}"
    check_subscription_line "WHITE LIST PRO" "WHITE%20LIST%20PRO" "@84.201.141.43:443" "pro.himenkov.ru" "${entry_sids}"

    if grep -Eiq 'borsaistanbul\.com|apple\.com|cloud\.cdn\.yandex|sun6-22\.userapi\.com' "${SUB_DECODED}"; then
      fail "subscription contains old camouflage domains"
    else
      pass "subscription has no old camouflage domains"
    fi
  else
    fail "failed to fetch subscription URL"
  fi
fi

section "Result"
if [ "${FAILURES}" -eq 0 ]; then
  printf 'PASS self-steal audit completed without failures\n'
  exit 0
fi

printf 'FAIL self-steal audit completed with %d failure(s)\n' "${FAILURES}"
exit 1
