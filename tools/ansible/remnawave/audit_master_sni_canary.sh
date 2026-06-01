#!/usr/bin/env bash
set -u

TIMEOUT="${REMNAWAVE_AUDIT_TIMEOUT:-10}"
CANARY_IP="${REMNAWAVE_MASTER_CANARY_IP:-5.42.111.142}"
CANARY_PORT="${REMNAWAVE_MASTER_CANARY_PORT:-${REMNAWAVE_MASTER_SNI_PORT:-443}}"
FAILURES=0
TMP_DIR="$(mktemp -d)"

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

check_status() {
  local label="$1"
  local host="$2"
  local expected="$3"
  local code

  code="$(curl -kfsS --max-time "${TIMEOUT}" --resolve "${host}:${CANARY_PORT}:${CANARY_IP}" -o /dev/null -w '%{http_code}' "https://${host}:${CANARY_PORT}/" 2>/dev/null)"

  if [ "${code}" = "${expected}" ]; then
    pass "${label}: HTTP ${expected}"
  else
    fail "${label}: expected HTTP ${expected}, got '${code:-curl failed}'"
  fi
}

check_status_in() {
  local label="$1"
  local host="$2"
  local allowed="$3"
  local code

  code="$(curl -kfsS --max-time "${TIMEOUT}" --resolve "${host}:${CANARY_PORT}:${CANARY_IP}" -o /dev/null -w '%{http_code}' "https://${host}:${CANARY_PORT}/" 2>/dev/null)"

  if [[ " ${allowed} " == *" ${code} "* ]]; then
    pass "${label}: HTTP ${code}"
  else
    fail "${label}: expected one of '${allowed}', got '${code:-curl failed}'"
  fi
}

check_not_admin_headers() {
  local label="$1"
  local host="$2"
  local headers="${TMP_DIR}/${label//[^a-zA-Z0-9]/_}.headers"

  if ! curl -kIsS --max-time "${TIMEOUT}" --resolve "${host}:${CANARY_PORT}:${CANARY_IP}" "https://${host}:${CANARY_PORT}/" >"${headers}" 2>/dev/null; then
    fail "${label}: failed to fetch headers"
    return
  fi

  if grep -Eiq 'access-control-allow-origin: panel\.moscow\.himenkov\.ru|x-robots-tag|remnawave' "${headers}"; then
    fail "${label}: response looks like admin/backend, not landing"
  else
    pass "${label}: response does not look like admin"
  fi
}

section "Master SNI route ${CANARY_IP}:${CANARY_PORT}"
check_status "moscow.himenkov.ru via Xray REALITY fallback" "moscow.himenkov.ru" "200"
check_not_admin_headers "moscow.himenkov.ru via Xray REALITY fallback" "moscow.himenkov.ru"
check_status "panel.moscow.himenkov.ru via nginx" "panel.moscow.himenkov.ru" "200"
check_status "sub.moscow.himenkov.ru via nginx" "sub.moscow.himenkov.ru" "200"
check_status_in "bot.moscow.himenkov.ru via nginx" "bot.moscow.himenkov.ru" "200 301 302 404"

section "Result"
if [ "${FAILURES}" -eq 0 ]; then
  printf 'PASS master SNI canary audit completed without failures\n'
  exit 0
fi

printf 'FAIL master SNI canary audit completed with %d failure(s)\n' "${FAILURES}"
exit 1
