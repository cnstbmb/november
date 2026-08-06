#!/usr/bin/env bash

set -euo pipefail

run_id="${1:-}"
source_ssh="${MIGRATION_SOURCE_SSH:-root@5.42.111.142}"
target_ssh="${MIGRATION_TARGET_SSH:-root@193.124.64.187}"
remote_root="${MIGRATION_REMOTE_ROOT:-/root/november-migration}"

ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
)

if [[ ! "$run_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  printf 'Usage: %s PRESEED_RUN_ID\n' "$0" >&2
  printf 'Example: %s 20260802T194315Z\n' "$0" >&2
  exit 2
fi

for host in "$source_ssh" "$target_ssh"; do
  if ! ssh "${ssh_options[@]}" "$host" true; then
    printf 'No non-interactive SSH connection to %s.\n' "$host" >&2
    printf 'Warm both hosts first: npm run ansible:warmup -- --limit master,migration\n' >&2
    exit 1
  fi
done

remote_config_root="${remote_root}/${run_id}/config/opt"
required_images_output="$({
  ssh "${ssh_options[@]}" "$target_ssh" \
    "set -e; for directory in remnawave-panel tonem remnashop adguardhome; do cd '$remote_config_root'/\"\$directory\"; docker compose config --images; done"
} | sort -u)"

required_images=()
while IFS= read -r image_name; do
  if [[ -n "$image_name" ]]; then
    required_images+=("$image_name")
  fi
done <<<"$required_images_output"

missing_images=()
for image_name in "${required_images[@]}"; do
  if ! ssh "${ssh_options[@]}" "$target_ssh" \
    docker image inspect "$image_name" >/dev/null 2>&1; then
    missing_images+=("$image_name")
  fi
done

if [[ ${#missing_images[@]} -eq 0 ]]; then
  printf 'All %d compose images are already present on %s.\n' \
    "${#required_images[@]}" "$target_ssh"
  exit 0
fi

printf 'Missing images on target:\n'
printf '  %s\n' "${missing_images[@]}"

ssh "${ssh_options[@]}" "$source_ssh" \
  docker image inspect "${missing_images[@]}" >/dev/null

printf 'Transferring missing images from %s to %s...\n' "$source_ssh" "$target_ssh"
ssh "${ssh_options[@]}" "$source_ssh" \
  docker image save "${missing_images[@]}" \
  | gzip -1 \
  | ssh "${ssh_options[@]}" "$target_ssh" 'gzip -dc | docker image load'

for image_name in "${missing_images[@]}"; do
  ssh "${ssh_options[@]}" "$target_ssh" \
    docker image inspect "$image_name" >/dev/null
done

printf 'All %d compose images are now present on %s.\n' \
  "${#required_images[@]}" "$target_ssh"

