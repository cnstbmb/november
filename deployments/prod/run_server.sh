#!/bin/sh
set -e

cd /srv

# остановить проект (если поднят)
docker compose down

# подтянуть свежие образы
docker compose pull

# поднять в фоне
docker compose up -d && docker compose logs -f -t
