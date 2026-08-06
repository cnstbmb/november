#!/usr/bin/env bash

set -euo pipefail

run_id="${1:-}"
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

if ! ssh "${ssh_options[@]}" "$target_ssh" true; then
  printf 'No non-interactive SSH connection to %s.\n' "$target_ssh" >&2
  printf 'Warm the target first: npm run ansible:warmup -- --limit migration\n' >&2
  exit 1
fi

printf 'Restoring preliminary databases on %s from %s...\n' "$target_ssh" "$run_id"

ssh "${ssh_options[@]}" "$target_ssh" bash -s -- "$run_id" "$remote_root" <<'REMOTE_SCRIPT'
set -euo pipefail

run_id="$1"
remote_root="$2"
run_dir="${remote_root}/${run_id}"

if ! hostname -I | tr ' ' '\n' | grep -Fxq '193.124.64.187'; then
  printf 'Refusing restore: this host does not own 193.124.64.187.\n' >&2
  exit 1
fi

for forbidden_container in \
  remnawave \
  remnawave-proxy \
  remnawave-panel-proxy \
  remnawave-subscription-page \
  tonem-server \
  tonem-web \
  remnashop \
  remnashop-taskiq-worker \
  remnashop-taskiq-scheduler \
  adguardhome; do
  if docker container inspect "$forbidden_container" >/dev/null 2>&1; then
    printf 'Refusing restore: application container %s already exists.\n' "$forbidden_container" >&2
    exit 1
  fi
done

for dump_name in remnawave tonem remnashop; do
  dump_path="${run_dir}/dumps/${dump_name}.dump"
  if [[ ! -s "$dump_path" ]]; then
    printf 'Missing or empty dump: %s\n' "$dump_path" >&2
    exit 1
  fi
  docker run --rm -i postgres:17 pg_restore --list <"$dump_path" >/dev/null
done

promote_directory() {
  local directory_name="$1"
  local source_path="${run_dir}/config/opt/${directory_name}"
  local destination_path="/opt/${directory_name}"
  local marker_path="${destination_path}/.november-preseed-source"

  if [[ ! -d "$source_path" ]]; then
    printf 'Missing staged configuration directory: %s\n' "$source_path" >&2
    exit 1
  fi

  install -d -m 0750 "$destination_path"

  if find "$destination_path" -mindepth 1 -maxdepth 1 ! -name '.november-preseed-source' -print -quit | grep -q .; then
    if [[ ! -f "$marker_path" ]] || [[ "$(<"$marker_path")" != "$run_id" ]]; then
      printf 'Refusing to overwrite non-empty unmarked directory: %s\n' "$destination_path" >&2
      exit 1
    fi
  fi

  cp -a "${source_path}/." "${destination_path}/"
  printf '%s\n' "$run_id" >"$marker_path"
  chmod 0600 "$marker_path"
  find "$destination_path" -maxdepth 1 -type f -name '.env*' -exec chmod 0600 {} +
}

promote_directory remnawave-panel
promote_directory tonem
promote_directory remnashop
promote_directory adguardhome

for compose_directory in /opt/remnawave-panel /opt/tonem /opt/remnashop /opt/adguardhome; do
  (
    cd "$compose_directory"
    docker compose config --quiet
  )
done

(
  cd /opt/remnawave-panel
  docker compose up -d --pull never --no-deps remnawave-db
)

(
  cd /opt/tonem
  docker compose up -d --pull never --no-deps tonem-postgres
)

(
  cd /opt/remnashop
  docker compose up -d --pull never --no-deps remnashop-db
)

wait_for_postgres() {
  local container_name="$1"
  local readiness_command="$2"

  for attempt in $(seq 1 60); do
    if docker exec "$container_name" sh -lc "$readiness_command" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  printf 'PostgreSQL did not become ready: %s\n' "$container_name" >&2
  docker logs --tail 100 "$container_name" >&2
  return 1
}

wait_for_postgres remnawave-db 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
wait_for_postgres tonem-postgres 'pg_isready -U tonem -d tonem'
wait_for_postgres remnashop-db 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

docker exec -i remnawave-db sh -lc \
  'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' \
  <"${run_dir}/dumps/remnawave.dump"

docker exec -i tonem-postgres \
  pg_restore -U tonem -d tonem --clean --if-exists --no-owner --no-privileges \
  <"${run_dir}/dumps/tonem.dump"

docker exec -i remnashop-db sh -lc \
  'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' \
  <"${run_dir}/dumps/remnashop.dump"

printf '\nRestored database sizes:\n'
docker exec remnawave-db sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_size_pretty(pg_database_size(current_database()));"' \
  | sed 's/^/remnawave: /'
docker exec tonem-postgres \
  psql -U tonem -d tonem -Atc 'select pg_size_pretty(pg_database_size(current_database()));' \
  | sed 's/^/tonem: /'
docker exec remnashop-db sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_size_pretty(pg_database_size(current_database()));"' \
  | sed 's/^/remnashop: /'

printf '\nRunning target containers:\n'
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' \
  | grep -E '^(remnanode|remnawave-db|tonem-postgres|remnashop-db)[[:space:]]'

printf '\nPreliminary restore completed. Application services and DNS remain untouched.\n'
REMOTE_SCRIPT
