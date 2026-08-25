#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONFIG_FILE="${TONEM_XHTTP_CONFIG_FILE:-${ROOT_DIR}/.private/ansible/prod/remnawave-tonem-xhttp.json}"
TARGET_FILTER=""

if [ "${1:-}" = "--target" ] && [ -n "${2:-}" ] && [ "${3:-}" = "" ]; then
  TARGET_FILTER="$2"
elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--target moscow|home|exit]" >&2
  exit 1
fi

case "${TARGET_FILTER}" in
  ""|moscow|home|exit) ;;
  *) echo "Unknown TONEM XHTTP target: ${TARGET_FILTER}" >&2; exit 1 ;;
esac

if [ ! -f "${CONFIG_FILE}" ]; then
  echo "Private TONEM XHTTP config not found. Run remnawave:tonem-xhttp:prepare first." >&2
  exit 1
fi

for command in curl dig jq; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required" >&2
    exit 1
  fi
done

audit_dir="$(mktemp -d)"
trap 'rm -rf "${audit_dir}"' EXIT
failures=0

while IFS=$'\t' read -r target domain ipv4; do
  if [ -z "${ipv4}" ]; then
    echo "FAIL ${target}: publicIpv4 is not configured"
    failures=$((failures + 1))
    continue
  fi

  a_records="$(dig +short A "${domain}" | sort -u)"
  aaaa_records="$(dig +short AAAA "${domain}" | sort -u)"
  a_record_count="$(printf '%s\n' "${a_records}" | awk 'NF { count += 1 } END { print count + 0 }')"
  if [ "${a_record_count}" -ne 1 ] || [ "${a_records}" != "${ipv4}" ]; then
    echo "FAIL ${target}: direct A record does not match private state"
    failures=$((failures + 1))
  elif [ -n "${aaaa_records}" ]; then
    echo "FAIL ${target}: unexpected AAAA record exists"
    failures=$((failures + 1))
  else
    echo "PASS ${target}: DNS is direct A-only"
  fi

  headers="${audit_dir}/${target}.headers"
  body="${audit_dir}/${target}.body"
  status="$({ curl -sS --resolve "${domain}:443:${ipv4}" -D "${headers}" -o "${body}" -w '%{http_code}' "https://${domain}/"; } || true)"
  if [ "${status}" != "200" ]; then
    echo "FAIL ${target}: facade returned HTTP ${status:-error}"
    failures=$((failures + 1))
    continue
  fi
  if ! grep -Eiq '^x-robots-tag:[[:space:]]*noindex' "${headers}"; then
    echo "FAIL ${target}: X-Robots-Tag noindex is missing"
    failures=$((failures + 1))
  elif ! grep -Fq '<link rel="canonical" href="https://tonem.ru/">' "${body}"; then
    echo "FAIL ${target}: canonical TONEM URL is missing"
    failures=$((failures + 1))
  else
    echo "PASS ${target}: TLS facade, noindex, and canonical are valid"
  fi

  telemetry_status="$({ curl -sS --resolve "${domain}:443:${ipv4}" -o /dev/null -w '%{http_code}' "https://${domain}/client-telemetry"; } || true)"
  analytics_status="$({ curl -sS --resolve "${domain}:443:${ipv4}" -o /dev/null -w '%{http_code}' "https://${domain}/analytics/script.js"; } || true)"
  analytics_config="$({ curl -sS --resolve "${domain}:443:${ipv4}" "https://${domain}/analytics-config.js"; } || true)"
  if [ "${telemetry_status}" != "404" ] || [ "${analytics_status}" != "404" ] || \
    ! printf '%s' "${analytics_config}" | grep -Eq 'enabled:[[:space:]]*false'; then
    echo "FAIL ${target}: analytics or telemetry is exposed"
    failures=$((failures + 1))
  else
    echo "PASS ${target}: analytics and telemetry are disabled"
  fi

  cors_headers="${audit_dir}/${target}.cors"
  curl -sS -D "${cors_headers}" -o /dev/null -H "Origin: https://${domain}" https://api.tonem.ru/health || true
  if ! grep -Eiq "^access-control-allow-origin:[[:space:]]*https://${domain//./\.}[[:space:]]*$" "${cors_headers}"; then
    echo "FAIL ${target}: exact API CORS origin is not active"
    failures=$((failures + 1))
  else
    echo "PASS ${target}: exact API CORS origin is active"
  fi
done < <(
  jq -r --arg target "${TARGET_FILTER}" \
    '.targets | to_entries[] | select(.value.enabled == true and ($target == "" or .key == $target)) | [.key, .value.domain, .value.publicIpv4] | @tsv' \
    "${CONFIG_FILE}"
)

if [ "${failures}" -ne 0 ]; then
  echo "TONEM XHTTP facade audit failed: ${failures} check(s) failed" >&2
  exit 1
fi

echo "TONEM XHTTP facade audit passed. XHTTP e2e status is supplied separately by xray-checker."
