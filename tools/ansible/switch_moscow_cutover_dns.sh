#!/usr/bin/env bash

set -euo pipefail

action="${1:-}"
target_ssh="${MIGRATION_TARGET_SSH:-root@193.124.64.187}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$action" != "cutover" && "$action" != "rollback" ]]; then
  printf 'Usage: %s cutover|rollback\n' "$0" >&2
  exit 2
fi

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
)

if ! ssh "${ssh_options[@]}" "$target_ssh" true; then
  printf 'No non-interactive SSH connection to %s.\n' "$target_ssh" >&2
  exit 1
fi

ssh "${ssh_options[@]}" "$target_ssh" \
  python3 - "$action" <"${script_dir}/cloudflare_migration_dns_switch.py"

