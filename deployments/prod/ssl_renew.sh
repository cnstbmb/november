#!/bin/sh
set -e

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "ERROR: Docker Compose не найден (ни docker-compose, ни 'docker compose')." >&2
  exit 1
fi
DOCKER="${DOCKER:-/usr/bin/docker}"

cd /srv/
$COMPOSE run certbot renew --dry-run && $COMPOSE kill -s SIGHUP webserver
$DOCKER system prune -af
