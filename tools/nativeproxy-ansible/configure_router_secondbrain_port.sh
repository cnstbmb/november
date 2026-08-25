#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---check}"
ROUTER_HOST="${ROUTER_HOST:-root@192.168.1.1}"
ROUTER_SSH_CONTROL_PATH="${ROUTER_SSH_CONTROL_PATH:-}"
RULE_NAME="SecondBrain-LiveSync-HTTPS"
EXTERNAL_PORT="${SECONDBRAIN_EXTERNAL_PORT:-15984}"
INTERNAL_IP="${SECONDBRAIN_INTERNAL_IP:-192.168.1.164}"
INTERNAL_PORT="${SECONDBRAIN_INTERNAL_PORT:-15984}"

if [[ "${MODE}" != "--check" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--check|--apply]" >&2
  exit 2
fi

ssh_args=(-o BatchMode=no)
if [[ -n "${ROUTER_SSH_CONTROL_PATH}" ]]; then
  ssh_args+=(-S "${ROUTER_SSH_CONTROL_PATH}")
fi

ssh "${ssh_args[@]}" "${ROUTER_HOST}" sh -s -- \
  "${MODE}" "${RULE_NAME}" "${EXTERNAL_PORT}" "${INTERNAL_IP}" "${INTERNAL_PORT}" <<'REMOTE'
set -eu

mode="$1"
rule_name="$2"
external_port="$3"
internal_ip="$4"
internal_port="$5"

section="$(uci show firewall | sed -n "s/^firewall\.\([^.=]*\)\.name='${rule_name}'$/\1/p" | head -1)"
needs_change=1

if [ -n "${section}" ]; then
  current_src="$(uci -q get "firewall.${section}.src" || true)"
  current_dest="$(uci -q get "firewall.${section}.dest" || true)"
  current_proto="$(uci -q get "firewall.${section}.proto" || true)"
  current_src_dport="$(uci -q get "firewall.${section}.src_dport" || true)"
  current_dest_ip="$(uci -q get "firewall.${section}.dest_ip" || true)"
  current_dest_port="$(uci -q get "firewall.${section}.dest_port" || true)"
  current_target="$(uci -q get "firewall.${section}.target" || true)"
  if [ "${current_src}" = wan ] &&
     [ "${current_dest}" = lan ] &&
     [ "${current_proto}" = tcp ] &&
     [ "${current_src_dport}" = "${external_port}" ] &&
     [ "${current_dest_ip}" = "${internal_ip}" ] &&
     [ "${current_dest_port}" = "${internal_port}" ] &&
     [ "${current_target}" = DNAT ]; then
    needs_change=0
  fi
fi

echo "rule=${rule_name}"
echo "external=tcp/${external_port}"
echo "destination=${internal_ip}:${internal_port}"

if [ "${mode}" = --check ]; then
  if [ "${needs_change}" -eq 0 ]; then
    echo "changed=false"
  else
    echo "changed=true"
  fi
  exit 0
fi

backup="/root/firewall.before-secondbrain.$(date -u +%Y%m%dT%H%M%SZ).uci"
uci export firewall > "${backup}"

if [ -z "${section}" ]; then
  section="$(uci add firewall redirect)"
fi

uci set "firewall.${section}.name=${rule_name}"
uci set "firewall.${section}.src=wan"
uci set "firewall.${section}.dest=lan"
uci set "firewall.${section}.proto=tcp"
uci set "firewall.${section}.src_dport=${external_port}"
uci set "firewall.${section}.dest_ip=${internal_ip}"
uci set "firewall.${section}.dest_port=${internal_port}"
uci set "firewall.${section}.target=DNAT"
uci commit firewall
/etc/init.d/firewall restart

[ "$(uci -q get "firewall.${section}.src_dport")" = "${external_port}" ]
[ "$(uci -q get "firewall.${section}.dest_ip")" = "${internal_ip}" ]
[ "$(uci -q get "firewall.${section}.dest_port")" = "${internal_port}" ]

echo "changed=true"
echo "backup=${backup}"
echo "verification=ok"
REMOTE
