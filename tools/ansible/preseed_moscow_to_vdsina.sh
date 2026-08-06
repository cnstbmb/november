#!/usr/bin/env bash

set -euo pipefail

source_ssh="${MIGRATION_SOURCE_SSH:-root@5.42.111.142}"
target_ssh="${MIGRATION_TARGET_SSH:-root@193.124.64.187}"
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
remote_run_dir="${MIGRATION_REMOTE_ROOT:-/root/november-migration}/${run_id}"

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
)

source_images=(
  remnawave/backend:2.8.1
  remnawave/node:2.8.0
  remnawave/subscription-page:latest
  nginx:mainline-alpine
  cnstbmb/tonem-server:latest
  cnstbmb/tonem-web:latest
  postgres:17.6
  postgres:17-alpine
  ghcr.io/snoups/remnashop:v0.8.2
  postgres:17
  valkey/valkey:8.1-alpine
  valkey/valkey:9-alpine
  adguard/adguardhome:v0.107.78
)

source_directories=(
  opt/remnawave-panel
  opt/tonem
  opt/remnashop
  opt/adguardhome
)

require_warm_connection() {
  local host="$1"

  if ! ssh "${ssh_options[@]}" "$host" true; then
    printf 'No non-interactive SSH connection to %s.\n' "$host" >&2
    printf 'Warm both hosts first: npm run ansible:warmup -- --limit master,migration\n' >&2
    exit 1
  fi
}

printf 'Checking warmed SSH connections...\n'
require_warm_connection "$source_ssh"
require_warm_connection "$target_ssh"

printf 'Creating protected staging directory on %s...\n' "$target_ssh"
ssh "${ssh_options[@]}" "$target_ssh" \
  "install -d -m 0700 '$remote_run_dir/config' '$remote_run_dir/dumps'"

printf 'Transferring the exact currently selected image tags...\n'
ssh "${ssh_options[@]}" "$source_ssh" \
  docker image save "${source_images[@]}" \
  | gzip -1 \
  | ssh "${ssh_options[@]}" "$target_ssh" 'gzip -dc | docker image load'

printf 'Copying service configuration into staging (not into /opt)...\n'
ssh "${ssh_options[@]}" "$source_ssh" \
  tar -C / -czf - "${source_directories[@]}" \
  | ssh "${ssh_options[@]}" "$target_ssh" \
    "umask 077; tar -xzf - -C '$remote_run_dir/config'"

printf 'Creating a transaction-consistent Remnawave preliminary dump...\n'
ssh "${ssh_options[@]}" "$source_ssh" \
  "docker exec remnawave-db sh -lc 'exec pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc'" \
  | ssh "${ssh_options[@]}" "$target_ssh" \
    "umask 077; cat > '$remote_run_dir/dumps/remnawave.dump.tmp'; mv '$remote_run_dir/dumps/remnawave.dump.tmp' '$remote_run_dir/dumps/remnawave.dump'"

printf 'Creating a transaction-consistent Tonem preliminary dump...\n'
ssh "${ssh_options[@]}" "$source_ssh" \
  "docker exec tonem-postgres pg_dump -U tonem -d tonem -Fc" \
  | ssh "${ssh_options[@]}" "$target_ssh" \
    "umask 077; cat > '$remote_run_dir/dumps/tonem.dump.tmp'; mv '$remote_run_dir/dumps/tonem.dump.tmp' '$remote_run_dir/dumps/tonem.dump'"

printf 'Creating a transaction-consistent Remnashop preliminary dump...\n'
ssh "${ssh_options[@]}" "$source_ssh" \
  "docker exec remnashop-db sh -lc 'exec pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc'" \
  | ssh "${ssh_options[@]}" "$target_ssh" \
    "umask 077; cat > '$remote_run_dir/dumps/remnashop.dump.tmp'; mv '$remote_run_dir/dumps/remnashop.dump.tmp' '$remote_run_dir/dumps/remnashop.dump'"

printf 'Verifying staged dump files...\n'
ssh "${ssh_options[@]}" "$target_ssh" \
  "test -s '$remote_run_dir/dumps/remnawave.dump' && test -s '$remote_run_dir/dumps/tonem.dump' && test -s '$remote_run_dir/dumps/remnashop.dump' && sha256sum '$remote_run_dir'/dumps/*.dump && du -sh '$remote_run_dir'"

printf '\nPreseed completed without stopping the old host or starting target services.\n'
printf 'Target staging directory: %s:%s\n' "$target_ssh" "$remote_run_dir"
