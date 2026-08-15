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
MOSCOW_SUBSCRIPTION_ADDRESS="${REMNAWAVE_AUDIT_MOSCOW_ADDRESS:-@moscow.himenkov.ru:443}"
MOSCOW_SUBSCRIPTION_SNI="${REMNAWAVE_AUDIT_MOSCOW_SNI:-moscow.himenkov.ru}"
MOSCOW_SUBSCRIPTION_HOST="${REMNAWAVE_AUDIT_MOSCOW_HOST:-moscow.himenkov.ru}"
MOSCOW_SUBSCRIPTION_PATH="${REMNAWAVE_AUDIT_MOSCOW_PATH:-%2Ffluegergeheimer-xhttp%2F}"
MOSCOW_SUBSCRIPTION_MODE="${REMNAWAVE_AUDIT_MOSCOW_MODE:-stream-one}"
MOSCOW_XHTTP_OUTBOUND="${REMNAWAVE_AUDIT_MOSCOW_OUTBOUND:-GRPC_TO_EXIT}"
MOSCOW_HYSTERIA2_REMARK="${REMNAWAVE_AUDIT_MOSCOW_HYSTERIA2_REMARK:-MOSCOW%20HYSTERIA2}"
MOSCOW_HYSTERIA2_ADDRESS="${REMNAWAVE_AUDIT_MOSCOW_HYSTERIA2_ADDRESS:-@moscow.himenkov.ru:443}"
MOSCOW_HYSTERIA2_SNI="${REMNAWAVE_AUDIT_MOSCOW_HYSTERIA2_SNI:-moscow.himenkov.ru}"
MOSCOW_HYSTERIA2_OUTBOUND="${REMNAWAVE_AUDIT_MOSCOW_HYSTERIA2_OUTBOUND:-GRPC_TO_EXIT}"
ENTRY_AUDIT_ENABLED="${REMNAWAVE_AUDIT_ENTRY_ENABLED:-false}"
ENTRY_SUBSCRIPTION_REMARK="${REMNAWAVE_AUDIT_ENTRY_REMARK:-ENTRY}"
ENTRY_SUBSCRIPTION_ADDRESS="${REMNAWAVE_AUDIT_ENTRY_ADDRESS:-}"
ENTRY_SUBSCRIPTION_SNI="${REMNAWAVE_AUDIT_ENTRY_SNI:-}"
ENTRY_SUBSCRIPTION_HOST="${REMNAWAVE_AUDIT_ENTRY_HOST:-}"
ENTRY_SUBSCRIPTION_PATH="${REMNAWAVE_AUDIT_ENTRY_PATH:-}"
ENTRY_CONFIG_PATH="${REMNAWAVE_AUDIT_ENTRY_CONFIG_PATH:-}"
EXIT_SUBSCRIPTION_ADDRESS="${REMNAWAVE_AUDIT_EXIT_ADDRESS:-@himenkov.ru:443}"
EXIT_SUBSCRIPTION_SNI="${REMNAWAVE_AUDIT_EXIT_SNI:-himenkov.ru}"
EXIT_SUBSCRIPTION_HOST="${REMNAWAVE_AUDIT_EXIT_HOST:-himenkov.ru}"
EXIT_SUBSCRIPTION_PATH="${REMNAWAVE_AUDIT_EXIT_PATH:-%2Ffluegergeheimer-exit-xhttp}"
HOME_SUBSCRIPTION_ADDRESS="${REMNAWAVE_AUDIT_HOME_ADDRESS:-@home.himenkov.ru:443}"
HOME_SUBSCRIPTION_SNI="${REMNAWAVE_AUDIT_HOME_SNI:-home.himenkov.ru}"
HOME_SUBSCRIPTION_HOST="${REMNAWAVE_AUDIT_HOME_HOST:-home.himenkov.ru}"
HOME_SUBSCRIPTION_PATH="${REMNAWAVE_AUDIT_HOME_PATH:-%2Ffluegergeheimer-home-xhttp}"

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
  local code=""
  local attempt

  for attempt in 1 2 3; do
    if [ -n "${resolve}" ]; then
      code="$(curl -kfsS --max-time "${TIMEOUT}" --resolve "${resolve}" -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null)"
    else
      code="$(curl -kfsS --max-time "${TIMEOUT}" -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null)"
    fi
    if [ "${code}" = "200" ]; then
      break
    fi
    if [ "${attempt}" -lt 3 ]; then
      sleep 1
    fi
  done

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

check_json_path_absent() {
  local label="$1"
  local file="$2"
  local expr="$3"

  if jq -e "${expr}" "${file}" >/dev/null 2>&1; then
    fail "${label}: unexpected JSON path exists"
  else
    pass "${label}: absent"
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

query_json_param() {
  local line="$1"
  local key="$2"
  python3 -c 'import sys, urllib.parse; print(urllib.parse.parse_qs(urllib.parse.urlsplit(sys.argv[1]).query).get(sys.argv[2], [""])[0])' "${line}" "${key}"
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

check_subscription_moscow_line() {
  local line
  local xhttp_extra

  line="$(line_for_remark "MOSCOW")"
  if [ -z "${line}" ]; then
    fail "subscription MOSCOW: link not found"
    return
  fi

  case "${line}" in
    *"${MOSCOW_SUBSCRIPTION_ADDRESS}"*) pass "subscription MOSCOW: address ${MOSCOW_SUBSCRIPTION_ADDRESS}" ;;
    *) fail "subscription MOSCOW: expected address ${MOSCOW_SUBSCRIPTION_ADDRESS}" ;;
  esac

  case "${line}" in
    *"type=xhttp"*) pass "subscription MOSCOW: type xhttp" ;;
    *) fail "subscription MOSCOW: expected type=xhttp" ;;
  esac

  case "${line}" in
    *"path=${MOSCOW_SUBSCRIPTION_PATH}"*) pass "subscription MOSCOW: path ${MOSCOW_SUBSCRIPTION_PATH}" ;;
    *) fail "subscription MOSCOW: expected path ${MOSCOW_SUBSCRIPTION_PATH}" ;;
  esac

  case "${line}" in
    *"host=${MOSCOW_SUBSCRIPTION_HOST}"*) pass "subscription MOSCOW: host ${MOSCOW_SUBSCRIPTION_HOST}" ;;
    *) fail "subscription MOSCOW: expected host ${MOSCOW_SUBSCRIPTION_HOST}" ;;
  esac

  case "${line}" in
    *"sni=${MOSCOW_SUBSCRIPTION_SNI}"*) pass "subscription MOSCOW: sni ${MOSCOW_SUBSCRIPTION_SNI}" ;;
    *) fail "subscription MOSCOW: expected sni ${MOSCOW_SUBSCRIPTION_SNI}" ;;
  esac

  case "${line}" in
    *"alpn=h2"*) pass "subscription MOSCOW: alpn h2" ;;
    *) fail "subscription MOSCOW: expected alpn=h2" ;;
  esac

  case "${line}" in
    *"mode=${MOSCOW_SUBSCRIPTION_MODE}"*) pass "subscription MOSCOW: mode ${MOSCOW_SUBSCRIPTION_MODE}" ;;
    *) fail "subscription MOSCOW: expected mode=${MOSCOW_SUBSCRIPTION_MODE}" ;;
  esac

  xhttp_extra="$(query_json_param "${line}" "extra")"
  if printf '%s\n' "${xhttp_extra}" | jq -e '
    .xmux.maxConcurrency == "16-32" and
    .xmux.maxConnections == 0 and
    .xmux.cMaxReuseTimes == 0 and
    .xmux.hMaxRequestTimes == "600-900" and
    .xmux.hMaxReusableSecs == "1800-3000" and
    .xmux.hKeepAlivePeriod == 0
  ' >/dev/null 2>&1; then
    pass "subscription MOSCOW: documented stable xmux values"
  else
    fail "subscription MOSCOW: unexpected xmux values"
  fi
}

check_subscription_no_xhttp_canary() {
  if [ -n "$(line_for_remark "MOSCOW%20XHTTP%20CANARY")" ]; then
    fail "subscription XHTTP CANARY: should not be present"
  else
    pass "subscription XHTTP CANARY: absent"
  fi
}

check_subscription_hysteria2_line() {
  local line

  line="$(line_for_remark "${MOSCOW_HYSTERIA2_REMARK}")"
  if [ -z "${line}" ]; then
    fail "subscription HYSTERIA2 MOSCOW: link not found"
    return
  fi

  case "${line}" in
    hysteria2://*|hy2://*) pass "subscription HYSTERIA2 MOSCOW: protocol" ;;
    *) fail "subscription HYSTERIA2 MOSCOW: expected hysteria2/hy2 link" ;;
  esac

  case "${line}" in
    *"${MOSCOW_HYSTERIA2_ADDRESS}"*) pass "subscription HYSTERIA2 MOSCOW: address ${MOSCOW_HYSTERIA2_ADDRESS}" ;;
    *) fail "subscription HYSTERIA2 MOSCOW: expected address ${MOSCOW_HYSTERIA2_ADDRESS}" ;;
  esac

  case "${line}" in
    *"sni=${MOSCOW_HYSTERIA2_SNI}"*) pass "subscription HYSTERIA2 MOSCOW: sni ${MOSCOW_HYSTERIA2_SNI}" ;;
    *) fail "subscription HYSTERIA2 MOSCOW: expected sni ${MOSCOW_HYSTERIA2_SNI}" ;;
  esac

  case "${line}" in
    *"alpn=h3"*) pass "subscription HYSTERIA2 MOSCOW: alpn h3" ;;
    *) fail "subscription HYSTERIA2 MOSCOW: expected alpn=h3" ;;
  esac
}

check_subscription_absent() {
  local label="$1"
  local remark="$2"

  if [ -n "$(line_for_remark "${remark}")" ]; then
    fail "subscription ${label}: should not be present"
  else
    pass "subscription ${label}: absent"
  fi
}

check_subscription_entry_line() {
  local line
  local entry_network

  line="$(line_for_remark "${ENTRY_SUBSCRIPTION_REMARK}")"
  if [ -z "${line}" ]; then
    fail "subscription ENTRY: link not found"
    return
  fi

  entry_network="$(json_value "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.network' 2>/dev/null)"

  if [ "${entry_network}" = "xhttp" ]; then
    case "${line}" in
      *"${ENTRY_SUBSCRIPTION_ADDRESS}"*) pass "subscription ENTRY: address ${ENTRY_SUBSCRIPTION_ADDRESS}" ;;
      *) fail "subscription ENTRY: expected address ${ENTRY_SUBSCRIPTION_ADDRESS}" ;;
    esac

    case "${line}" in
      *"type=xhttp"*) pass "subscription ENTRY: type xhttp" ;;
      *) fail "subscription ENTRY: expected type=xhttp" ;;
    esac

    case "${line}" in
      *"path=${ENTRY_SUBSCRIPTION_PATH}"*) pass "subscription ENTRY: path ${ENTRY_SUBSCRIPTION_PATH}" ;;
      *) fail "subscription ENTRY: expected path ${ENTRY_SUBSCRIPTION_PATH}" ;;
    esac

    case "${line}" in
      *"host=${ENTRY_SUBSCRIPTION_HOST}"*) pass "subscription ENTRY: host ${ENTRY_SUBSCRIPTION_HOST}" ;;
      *) fail "subscription ENTRY: expected host ${ENTRY_SUBSCRIPTION_HOST}" ;;
    esac

    case "${line}" in
      *"sni=${ENTRY_SUBSCRIPTION_SNI}"*) pass "subscription ENTRY: sni ${ENTRY_SUBSCRIPTION_SNI}" ;;
      *) fail "subscription ENTRY: expected sni ${ENTRY_SUBSCRIPTION_SNI}" ;;
    esac
    return
  fi

  entry_sids="$(json_value "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.realitySettings.shortIds | join("|")')"
  check_subscription_line "ENTRY" "${ENTRY_SUBSCRIPTION_REMARK}" "${ENTRY_SUBSCRIPTION_ADDRESS}" "${ENTRY_SUBSCRIPTION_SNI}" "${entry_sids}"
}

check_subscription_exit_line() {
  local line
  local exit_network

  line="$(line_for_remark "AMSTERDAM")"
  if [ -z "${line}" ]; then
    fail "subscription AMSTERDAM: link not found"
    return
  fi

  exit_network="$(json_value "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.network' 2>/dev/null)"

  if [ "${exit_network}" = "xhttp" ]; then
    case "${line}" in
      *"${EXIT_SUBSCRIPTION_ADDRESS}"*) pass "subscription AMSTERDAM: address ${EXIT_SUBSCRIPTION_ADDRESS}" ;;
      *) fail "subscription AMSTERDAM: expected address ${EXIT_SUBSCRIPTION_ADDRESS}" ;;
    esac

    case "${line}" in
      *"type=xhttp"*) pass "subscription AMSTERDAM: type xhttp" ;;
      *) fail "subscription AMSTERDAM: expected type=xhttp" ;;
    esac

    case "${line}" in
      *"path=${EXIT_SUBSCRIPTION_PATH}"*) pass "subscription AMSTERDAM: path ${EXIT_SUBSCRIPTION_PATH}" ;;
      *) fail "subscription AMSTERDAM: expected path ${EXIT_SUBSCRIPTION_PATH}" ;;
    esac

    case "${line}" in
      *"host=${EXIT_SUBSCRIPTION_HOST}"*) pass "subscription AMSTERDAM: host ${EXIT_SUBSCRIPTION_HOST}" ;;
      *) fail "subscription AMSTERDAM: expected host ${EXIT_SUBSCRIPTION_HOST}" ;;
    esac

    case "${line}" in
      *"sni=${EXIT_SUBSCRIPTION_SNI}"*) pass "subscription AMSTERDAM: sni ${EXIT_SUBSCRIPTION_SNI}" ;;
      *) fail "subscription AMSTERDAM: expected sni ${EXIT_SUBSCRIPTION_SNI}" ;;
    esac
    return
  fi

  exit_sids="$(json_value "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.realitySettings.shortIds | join("|")')"
  check_subscription_line "AMSTERDAM" "AMSTERDAM" "@109.234.34.227:443" "himenkov.ru" "${exit_sids}"
}

check_subscription_home_line() {
  local line
  local home_network

  line="$(line_for_remark "HOME")"
  if [ -z "${line}" ]; then
    fail "subscription HOME: link not found"
    return
  fi

  home_network="$(json_value "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_HOME_REALITY_DIRECT") | .streamSettings.network' 2>/dev/null)"

  if [ "${home_network}" = "xhttp" ]; then
    case "${line}" in
      *"${HOME_SUBSCRIPTION_ADDRESS}"*) pass "subscription HOME: address ${HOME_SUBSCRIPTION_ADDRESS}" ;;
      *) fail "subscription HOME: expected address ${HOME_SUBSCRIPTION_ADDRESS}" ;;
    esac

    case "${line}" in
      *"type=xhttp"*) pass "subscription HOME: type xhttp" ;;
      *) fail "subscription HOME: expected type=xhttp" ;;
    esac

    case "${line}" in
      *"path=${HOME_SUBSCRIPTION_PATH}"*) pass "subscription HOME: path ${HOME_SUBSCRIPTION_PATH}" ;;
      *) fail "subscription HOME: expected path ${HOME_SUBSCRIPTION_PATH}" ;;
    esac

    case "${line}" in
      *"host=${HOME_SUBSCRIPTION_HOST}"*) pass "subscription HOME: host ${HOME_SUBSCRIPTION_HOST}" ;;
      *) fail "subscription HOME: expected host ${HOME_SUBSCRIPTION_HOST}" ;;
    esac

    case "${line}" in
      *"sni=${HOME_SUBSCRIPTION_SNI}"*) pass "subscription HOME: sni ${HOME_SUBSCRIPTION_SNI}" ;;
      *) fail "subscription HOME: expected sni ${HOME_SUBSCRIPTION_SNI}" ;;
    esac
    return
  fi

  home_sids="$(json_value "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_HOME_REALITY_DIRECT") | .streamSettings.realitySettings.shortIds | join("|")')"
  check_subscription_line "HOME" "HOME" "@95.31.244.3:443" "home.himenkov.ru" "${home_sids}"
}

section "Tooling"
require_cmd curl
require_cmd jq
require_cmd base64
require_cmd python3

section "Public fallback"
check_http_status "sub.moscow.himenkov.ru root" "sub.moscow.himenkov.ru:443:193.124.64.187" "https://sub.moscow.himenkov.ru/"
check_http_status "moscow.himenkov.ru root" "moscow.himenkov.ru:443:193.124.64.187" "https://moscow.himenkov.ru/"
check_http_status "MOSCOW 10443 fallback" "sub.moscow.himenkov.ru:10443:193.124.64.187" "https://sub.moscow.himenkov.ru:10443/"
if [ "${ENTRY_AUDIT_ENABLED}" = "true" ]; then
  check_http_status "ENTRY fallback" "${ENTRY_SUBSCRIPTION_SNI#@}:443:${ENTRY_SUBSCRIPTION_ADDRESS#@}" "https://${ENTRY_SUBSCRIPTION_SNI}/"
fi
check_http_status "AMSTERDAM fallback" "himenkov.ru:443:109.234.34.227" "https://himenkov.ru/"

section "Header camouflage"
check_headers_clean "MOSCOW 10443 fallback" "sub.moscow.himenkov.ru:10443:193.124.64.187" "https://sub.moscow.himenkov.ru:10443/"
check_headers_clean "moscow.himenkov.ru root" "moscow.himenkov.ru:443:193.124.64.187" "https://moscow.himenkov.ru/"
if [ "${ENTRY_AUDIT_ENABLED}" = "true" ]; then
  check_headers_clean "ENTRY fallback" "${ENTRY_SUBSCRIPTION_SNI#@}:443:${ENTRY_SUBSCRIPTION_ADDRESS#@}" "https://${ENTRY_SUBSCRIPTION_SNI}/"
fi
check_headers_clean "AMSTERDAM fallback" "himenkov.ru:443:109.234.34.227" "https://himenkov.ru/"

section "Local config files"
if [ "${ENTRY_AUDIT_ENABLED}" = "true" ]; then
  if [ "$(json_value "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.network' 2>/dev/null)" = "xhttp" ]; then
    check_json_value "ENTRY_NODE network" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.network' "xhttp"
    entry_security="$(json_value "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.security')"
    case "${entry_security}" in
      tls|none) pass "ENTRY_NODE security: ${entry_security}" ;;
      *) fail "ENTRY_NODE security: expected tls or none, got '${entry_security}'" ;;
    esac
    check_json_value "ENTRY_NODE xhttp host" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.xhttpSettings.host' "${ENTRY_SUBSCRIPTION_HOST}"
    check_json_value "ENTRY_NODE xhttp path" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.xhttpSettings.path' "${ENTRY_CONFIG_PATH}"
  else
    check_json_value "ENTRY_NODE target" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.realitySettings.target // .streamSettings.realitySettings.dest' "127.0.0.1:9443"
    check_json_value "ENTRY_NODE serverName" "${ROOT_DIR}/.private/configs/ENTRY_NODE.json" '.inbounds[] | select(.tag=="VLESS_TCP_REALITY") | .streamSettings.realitySettings.serverNames[0]' "${ENTRY_SUBSCRIPTION_SNI}"
  fi
fi
check_json_value "MASTER MOSCOW target" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.target' "127.0.0.1:443"
check_json_value "MASTER MOSCOW serverName" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.serverNames[0]' "sub.moscow.himenkov.ru"
check_json_array_contains "MASTER MOSCOW 443 SNI" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_MOSCOW") | .streamSettings.realitySettings.serverNames[]' "moscow.himenkov.ru"
if jq -e '
  [.inbounds[]
    | select(.tag=="VLESS_REALITY_MOSCOW" or .tag=="VLESS_REALITY_HOME_WIFI")
    | .streamSettings.realitySettings.privateKey]
  | length == 2 and (unique | length == 2)
' "${ROOT_DIR}/.private/configs/MASTER_NODE.json" >/dev/null; then
  pass "MASTER Reality private keys: present and distinct"
else
  fail "MASTER Reality private keys: expected two distinct keys"
fi
check_json_value "MASTER Amsterdam bridge UUID" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.outbounds[] | select(.tag=="GRPC_TO_EXIT") | .settings.vnext[0].users[0].id | length > 0' "true"
check_json_path_absent "MASTER legacy Home gRPC outbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.outbounds[] | select(.tag=="GRPC_TO_HOME_RU")'
check_json_value "MASTER Home kernel-WG protocol" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.outbounds[] | select(.tag=="WG_TO_HOME_RU") | .protocol' "freedom"
check_json_value "MASTER Home kernel-WG interface" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.outbounds[] | select(.tag=="WG_TO_HOME_RU") | .streamSettings.sockopt.interface' "home_exit_wg"
check_json_path_absent "MASTER DIRECT inbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT_MSK")'
check_json_value "MASTER MOSCOW xhttp network" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_XHTTP_MOSCOW") | .streamSettings.network' "xhttp"
check_json_value "MASTER MOSCOW xhttp security" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_XHTTP_MOSCOW") | .streamSettings.security' "none"
check_json_value "MASTER MOSCOW xhttp listen" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_XHTTP_MOSCOW") | .listen' "0.0.0.0"
check_json_value "MASTER MOSCOW xhttp host" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_XHTTP_MOSCOW") | .streamSettings.xhttpSettings.host' "moscow.himenkov.ru"
check_json_value "MASTER MOSCOW xhttp path" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_XHTTP_MOSCOW") | .streamSettings.xhttpSettings.path' "/fluegergeheimer-xhttp/"
check_json_value "MASTER MOSCOW xhttp mode" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="VLESS_XHTTP_MOSCOW") | .streamSettings.xhttpSettings.mode' "stream-one"
check_json_value "MASTER Moscow service domains direct" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("domain:sub.moscow.himenkov.ru")) and .outboundTag=="IPv4") | .outboundTag' "IPv4"
check_json_value "MASTER Moscow self 443 direct" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.ip? and (.ip | index("193.124.64.187")) and .port=="443" and .outboundTag=="IPv4") | .outboundTag' "IPv4"
check_json_value "MASTER Home WiFi default outbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag==["VLESS_REALITY_HOME_WIFI"] and (.domain? | not) and (.ip? | not) and (.port? | not)) | .outboundTag' "GRPC_TO_EXIT"
check_json_value "MASTER bridge default outbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag==["BRIDGE_MASTER_IN"] and (.domain? | not) and (.ip? | not) and (.port? | not)) | .outboundTag' "GRPC_TO_EXIT"
check_json_value "MASTER Reality default outbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag==["VLESS_REALITY_MOSCOW"] and (.domain? | not) and (.ip? | not) and (.port? | not)) | .outboundTag' "GRPC_TO_EXIT"
check_json_value "MASTER MOSCOW xhttp outbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag? and (.inboundTag | index("VLESS_XHTTP_MOSCOW")) and (.domain? | not) and (.ip? | not) and (.port? | not)) | .outboundTag' "${MOSCOW_XHTTP_OUTBOUND}"
check_json_value "MASTER HYSTERIA2 protocol" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="HYSTERIA2_MOSCOW") | .protocol' "hysteria"
check_json_value "MASTER HYSTERIA2 port" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="HYSTERIA2_MOSCOW") | .port' "443"
check_json_value "MASTER HYSTERIA2 network" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="HYSTERIA2_MOSCOW") | .streamSettings.network' "hysteria"
check_json_value "MASTER HYSTERIA2 security" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="HYSTERIA2_MOSCOW") | .streamSettings.security' "tls"
check_json_value "MASTER HYSTERIA2 alpn" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.inbounds[] | select(.tag=="HYSTERIA2_MOSCOW") | .streamSettings.tlsSettings.alpn[0]' "h3"
check_json_value "MASTER HYSTERIA2 default outbound" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag? and (.inboundTag | index("HYSTERIA2_MOSCOW")) and (.domain? | not) and (.ip? | not) and (.port? | not)) | .outboundTag' "${MOSCOW_HYSTERIA2_OUTBOUND}"
check_json_value "MASTER HYSTERIA2 service domains direct" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("domain:sub.moscow.himenkov.ru")) and (.inboundTag | index("HYSTERIA2_MOSCOW")) and .outboundTag=="IPv4") | .outboundTag' "IPv4"
check_json_value "MASTER HYSTERIA2 self 443 direct" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.ip? and (.ip | index("193.124.64.187")) and .port=="443" and (.inboundTag | index("HYSTERIA2_MOSCOW"))) | .outboundTag' "IPv4"
check_json_path_absent "MASTER YouTube Moscow direct override" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("geosite:youtube")))'
check_json_path_absent "MASTER HYSTERIA2 RU direct override" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag? and (.inboundTag | index("HYSTERIA2_MOSCOW")) and .outboundTag=="IPv4" and (.ip? | index("geoip:ru")))'
check_json_path_absent "MASTER HYSTERIA2 category-ru direct override" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.inboundTag? and (.inboundTag | index("HYSTERIA2_MOSCOW")) and .outboundTag=="IPv4" and (.domain? | index("geosite:category-ru")))'
check_json_value "MASTER self backend block" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.ip? and (.ip | index("193.124.64.187")) and .port=="10085" and (.inboundTag | index("VLESS_XHTTP_MOSCOW"))) | .outboundTag' "BLOCK"
check_json_value "MASTER Dodo via Home WG" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("domain:dodois.io"))) | .outboundTag' "WG_TO_HOME_RU"
check_json_value "MASTER Hikari via Home WG" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("domain:hikari-dot-app-dot-doubleb-automation-production.appspot.com"))) | .outboundTag' "WG_TO_HOME_RU"
check_json_value "MASTER Russian TLDs via Home WG" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("domain:ru")) and (.domain | index("domain:xn--p1ai")) and (.domain | index("domain:su"))) | .outboundTag' "WG_TO_HOME_RU"
check_json_value "MASTER RU category via Home WG" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.rules[] | select(.domain? and (.domain | index("geosite:category-ru")) and (.inboundTag? | not)) | .outboundTag' "WG_TO_HOME_RU"
check_json_path_absent "MASTER Home fallback balancer" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.routing.balancers[]? | select(.tag=="HOME_OR_MOSCOW")'
check_json_value "MASTER Home observatory selector" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.observatory.subjectSelector | join(",")' "WG_TO_HOME_RU"
check_json_value "MASTER Home observatory interval" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.observatory.probeInterval' "15s"
check_json_value "MASTER Home observatory probe URL" "${ROOT_DIR}/.private/configs/MASTER_NODE.json" '.observatory.probeUrl' "https://ya.ru/"
if rg -U 'firewall_allow_cidr_tcp_ports:[\s\S]*cidr: "172\.18\.0\.0/16"[\s\S]*port: 10085' "${ROOT_DIR}/.private/ansible/prod/group_vars/master.yml" >/dev/null; then
  pass "MASTER 10085 firewall config: allows Docker bridge CIDR"
else
  fail "MASTER 10085 firewall config: missing Docker bridge CIDR allow"
fi
if rg -U 'firewall_extra_udp_ports:[\s\S]*- 443' "${ROOT_DIR}/.private/ansible/prod/host_vars/moscow.himenkov.ru/remnawave_topology.yml" >/dev/null; then
  pass "MASTER HYSTERIA2 firewall: opens 443/udp"
else
  fail "MASTER HYSTERIA2 firewall: missing 443/udp"
fi
TOPOLOGY_FILE="${ROOT_DIR}/.private/ansible/prod/remnawave-topology/topology.yml"
if [ ! -f "${TOPOLOGY_FILE}" ]; then
  warn "bridge_master_to_exit: topology.yml is absent, skipping local topology check"
elif rg -U 'username: "bridge_master_to_exit"[\s\S]*- "Bridge Exit Squad"' "${TOPOLOGY_FILE}" >/dev/null; then
  pass "bridge_master_to_exit: has Bridge Exit Squad"
else
  fail "bridge_master_to_exit: missing Bridge Exit Squad"
fi
if [ "$(json_value "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.network' 2>/dev/null)" = "xhttp" ]; then
  check_json_value "EXIT_NODE network" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.network' "xhttp"
  exit_security="$(json_value "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.security')"
  case "${exit_security}" in
    tls|none) pass "EXIT_NODE security: ${exit_security}" ;;
    *) fail "EXIT_NODE security: expected tls or none, got '${exit_security}'" ;;
  esac
  check_json_value "EXIT_NODE xhttp host" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.xhttpSettings.host' "himenkov.ru"
  check_json_value "EXIT_NODE xhttp path" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.xhttpSettings.path' "/fluegergeheimer-exit-xhttp"
  check_json_path_absent "EXIT_NODE DIRECT egress noises" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.outbounds[] | select(.tag=="DIRECT") | .settings.noises'
  check_json_path_absent "EXIT_NODE IPv4 egress noises" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.outbounds[] | select(.tag=="IPv4") | .settings.noises'
else
  check_json_value "EXIT_NODE target" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.realitySettings.target' "127.0.0.1:9443"
  check_json_value "EXIT_NODE serverName" "${ROOT_DIR}/.private/configs/EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_REALITY_DIRECT") | .streamSettings.realitySettings.serverNames[0]' "himenkov.ru"
fi
check_json_path_absent "HOME_EXIT_NODE public direct inbound" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="VLESS_HOME_REALITY_DIRECT")'
check_json_value "HOME_EXIT_NODE bridge network" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="BRIDGE_HOME_RU_IN") | .streamSettings.network' "grpc"
check_json_value "HOME_EXIT_NODE bridge security" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.inbounds[] | select(.tag=="BRIDGE_HOME_RU_IN") | .streamSettings.security' "tls"
check_json_path_absent "HOME_EXIT_NODE DIRECT egress noises" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.outbounds[] | select(.tag=="DIRECT") | .settings.noises'
check_json_path_absent "HOME_EXIT_NODE IPv4 egress noises" "${ROOT_DIR}/.private/configs/HOME_EXIT_NODE.json" '.outbounds[] | select(.tag=="IPv4") | .settings.noises'

section "Subscription"
if [ -z "${SUBSCRIPTION_URL}" ]; then
  fail "REMNAWAVE_SUBSCRIPTION_URL is not set. Put it into ${AUDIT_ENV}"
else
  if curl -fsSL --max-time "${TIMEOUT}" "${SUBSCRIPTION_URL}" >"${SUB_RAW}" 2>/dev/null; then
    decode_subscription
    check_subscription_moscow_line
    check_subscription_hysteria2_line
    check_subscription_absent "DIRECT MOSCOW" "DIRECT%20MOSCOW"
    check_subscription_exit_line
    check_subscription_absent "HOME" "HOME"
    if [ "${ENTRY_AUDIT_ENABLED}" = "true" ]; then
      check_subscription_entry_line
    fi
    check_subscription_no_xhttp_canary

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
