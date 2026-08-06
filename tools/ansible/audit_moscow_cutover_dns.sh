#!/usr/bin/env bash

set -euo pipefail

target_ssh="${MIGRATION_TARGET_SSH:-root@193.124.64.187}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
)

if ! ssh "${ssh_options[@]}" "$target_ssh" true; then
  printf 'No non-interactive SSH connection to %s.\n' "$target_ssh" >&2
  printf 'Warm the target first: npm run ansible:warmup -- --limit migration\n' >&2
  exit 1
fi

ssh "${ssh_options[@]}" "$target_ssh" \
  python3 - <"${script_dir}/cloudflare_migration_dns_audit.py"

