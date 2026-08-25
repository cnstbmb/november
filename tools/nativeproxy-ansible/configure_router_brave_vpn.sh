#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---check}"
ROUTER_HOST="${ROUTER_HOST:-root@192.168.1.1}"
ROUTER_SSH_CONTROL_PATH="${ROUTER_SSH_CONTROL_PATH:-}"
ZEROBLOCK_SECTION="${ZEROBLOCK_SECTION:-Moscow}"

if [[ "${MODE}" != "--check" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--check|--apply]" >&2
  exit 2
fi

ssh_args=( -o BatchMode=no )
if [[ -n "${ROUTER_SSH_CONTROL_PATH}" ]]; then
  ssh_args+=( -S "${ROUTER_SSH_CONTROL_PATH}" )
fi

ssh "${ssh_args[@]}" "${ROUTER_HOST}" sh -s -- "${MODE}" "${ZEROBLOCK_SECTION}" <<'REMOTE'
set -eu

mode="$1"
section="$2"
config="zeroblock.${section}"

if ! uci -q get "${config}" >/dev/null; then
  echo "Zeroblock section '${section}' does not exist" >&2
  exit 1
fi

desired_domains='apple.com smtp2go.com brave.com'
current_domains="$(uci -q get "${config}.user_domains_text" || true)"
current_enabled="$(uci -q get "${config}.enable_user_lists" || true)"
current_type="$(uci -q get "${config}.user_domain_list_type" || true)"

echo "section=${section}"
echo "current_enabled=${current_enabled:-0}"
echo "current_type=${current_type:-unset}"
echo "desired_domains=${desired_domains}"

needs_change=0
[ "${current_enabled}" = "1" ] || needs_change=1
[ "${current_type}" = "text" ] || needs_change=1
for domain in ${desired_domains}; do
  printf '%s\n' "${current_domains}" | tr ' \t' '\n' | grep -Fxq "${domain}" || needs_change=1
done

if [ "${mode}" = "--check" ]; then
  if [ "${needs_change}" -eq 0 ]; then
    echo "changed=false"
  else
    echo "changed=true"
  fi
  exit 0
fi

backup="/root/zeroblock.before-brave.$(date -u +%Y%m%dT%H%M%SZ).uci"
uci export zeroblock > "${backup}"

uci set "${config}.user_domain_list_type=text"
uci set "${config}.enable_user_lists=1"
uci -q delete "${config}.user_domains_text" || true
for domain in ${desired_domains}; do
  uci add_list "${config}.user_domains_text=${domain}"
done
uci commit zeroblock
/etc/init.d/zeroblock restart

for domain in ${desired_domains}; do
  uci -q get "${config}.user_domains_text" | grep -Fxq "${domain}"
done
[ "$(uci -q get "${config}.enable_user_lists")" = "1" ]

echo "changed=true"
echo "backup=${backup}"
echo "verification=ok"
REMOTE
