#!/bin/sh

set -eu

backup_root="${NOVEMBER_BACKUP_ROOT:-/var/backups/november}"
retention_days="${NOVEMBER_BACKUP_RETENTION_DAYS:-14}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
lock_file="/run/lock/november-db-backup.lock"

umask 077

if [ "${NOVEMBER_BACKUP_LOCKED:-0}" != "1" ]; then
  export NOVEMBER_BACKUP_LOCKED=1
  exec flock -n "$lock_file" "$0" "$@"
fi

backup_database() {
  database_name="$1"
  container_name="$2"
  dump_mode="$3"
  destination_dir="${backup_root}/${database_name}"
  temporary_file="${destination_dir}/${database_name}-${timestamp}.dump.tmp"
  final_file="${destination_dir}/${database_name}-${timestamp}.dump"

  install -d -m 0700 "$destination_dir"

  case "$dump_mode" in
    container-env)
      docker exec "$container_name" sh -lc \
        'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
        >"$temporary_file"
      ;;
    tonem)
      docker exec "$container_name" \
        pg_dump -U tonem -d tonem -Fc \
        >"$temporary_file"
      ;;
    *)
      printf 'Unknown dump mode: %s\n' "$dump_mode" >&2
      return 1
      ;;
  esac

  test -s "$temporary_file"
  docker exec -i "$container_name" pg_restore --list \
    <"$temporary_file" >/dev/null
  mv "$temporary_file" "$final_file"
  ln -sfn "$(basename "$final_file")" "${destination_dir}/latest.dump"
  find "$destination_dir" -type f -name '*.dump' \
    -mtime "+${retention_days}" -delete
  printf '%s: %s\n' "$database_name" "$final_file"
}

cleanup_temporary_files() {
  find "$backup_root" -type f -name '*.dump.tmp' -delete 2>/dev/null || true
}

trap cleanup_temporary_files EXIT HUP INT TERM

install -d -m 0700 "$backup_root"
backup_database remnawave remnawave-db container-env
backup_database tonem tonem-postgres tonem
backup_database remnashop remnashop-db container-env

