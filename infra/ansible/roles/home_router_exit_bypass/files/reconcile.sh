#!/bin/sh
set -eu

mode="${1:---check}"
state="${2:-present}"
source_ipv4="${3:-192.168.1.164}"
direct_mark="${4:-0x00020000}"
table_name='home_exit_bypass'
nft_bin="${NFT_BIN:-nft}"
firewall_init="${FIREWALL_INIT:-/etc/init.d/firewall}"
persistent_file="${HOME_EXIT_BYPASS_PERSISTENT_FILE:-/usr/share/nftables.d/ruleset-post/31-home-exit-bypass.nft}"
desired_file="${HOME_EXIT_BYPASS_DESIRED_FILE:-/tmp/home-exit-bypass.desired.nft}"
backup_dir="${HOME_EXIT_BYPASS_BACKUP_DIR:-/root}"

cleanup() {
  rm -f "$desired_file"
}
trap cleanup EXIT

case "$mode" in
  --check|--apply) ;;
  *) echo "unsupported mode: $mode" >&2; exit 2 ;;
esac
case "$state" in
  present|absent) ;;
  *) echo "unsupported state: $state" >&2; exit 2 ;;
esac

cat >"$desired_file" <<EOF
table inet $table_name {
  chain prerouting {
    type filter hook prerouting priority mangle - 1; policy accept;
    ip saddr $source_ipv4 meta mark set $direct_mark counter comment "HOME exit bypasses Zeroblock"
  }
}
EOF

is_live=0
if "$nft_bin" list chain inet "$table_name" prerouting 2>/dev/null \
  | grep -F "ip saddr $source_ipv4" \
  | grep -F "meta mark set $direct_mark" >/dev/null; then
  is_live=1
fi

if [ "$state" = present ]; then
  is_persistent=0
  if [ -f "$persistent_file" ] && cmp -s "$desired_file" "$persistent_file"; then
    is_persistent=1
  fi
  if [ "$is_live" -eq 1 ] && [ "$is_persistent" -eq 1 ]; then
    echo 'changed=false'
    echo 'verification=ok'
    exit 0
  fi
else
  if [ "$is_live" -eq 0 ] && [ ! -e "$persistent_file" ]; then
    echo 'changed=false'
    echo 'verification=ok'
    exit 0
  fi
fi

if [ "$mode" = --check ]; then
  echo 'changed=true'
  echo 'verification=ok'
  exit 0
fi

backup_file=""
if [ -f "$persistent_file" ]; then
  backup_file="$backup_dir/31-home-exit-bypass.$(date -u +%Y%m%dT%H%M%SZ).nft"
  cp "$persistent_file" "$backup_file"
fi

remove_live_table() {
  if "$nft_bin" list table inet "$table_name" >/dev/null 2>&1; then
    "$nft_bin" delete table inet "$table_name"
  fi
}

rollback() {
  if [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
    cp "$backup_file" "$persistent_file"
  else
    rm -f "$persistent_file"
  fi
  remove_live_table >/dev/null 2>&1 || true
  "$firewall_init" reload >/dev/null 2>&1 || true
}

if [ "$state" = present ]; then
  cp "$desired_file" "$persistent_file"
  chmod 0600 "$persistent_file"
else
  rm -f "$persistent_file"
fi

if ! remove_live_table || ! "$firewall_init" reload; then
  rollback
  echo 'firewall reload failed; rolled back' >&2
  exit 1
fi

if [ "$state" = present ]; then
  if ! "$nft_bin" list chain inet "$table_name" prerouting 2>/dev/null \
    | grep -F "ip saddr $source_ipv4" \
    | grep -F "meta mark set $direct_mark" >/dev/null; then
    rollback
    echo 'live bypass verification failed; rolled back' >&2
    exit 1
  fi
else
  if "$nft_bin" list table inet "$table_name" >/dev/null 2>&1; then
    rollback
    echo 'live bypass removal verification failed; rolled back' >&2
    exit 1
  fi
fi

echo 'changed=true'
echo 'verification=ok'
if [ -n "$backup_file" ]; then
  echo "backup=$backup_file"
fi
