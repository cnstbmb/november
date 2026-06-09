#!/usr/bin/env sh
set -eu

echo "== stopping remnawave node compose if present =="
if [ -f /opt/remnawave-node/docker-compose.yml ]; then
  docker compose -f /opt/remnawave-node/docker-compose.yml down --remove-orphans || true
fi

echo "== removing remnawave node containers =="
docker rm -f remnanode 2>/dev/null || true
docker ps -a --format '{{.ID}} {{.Image}}' \
  | awk '$2 ~ /^remnawave\/node/ { print $1 }' \
  | xargs -r docker rm -f

echo "== removing remnawave node files =="
rm -rf /opt/remnawave-node

echo "== removing remnawave node images =="
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
  | awk '$1 ~ /^remnawave\/node:/ { print $2 }' \
  | xargs -r docker rmi -f

echo "== removing remnawave-specific firewall allows =="
for port in 2222 8443; do
  ufw delete allow "${port}/tcp" >/dev/null 2>&1 || true
done

echo "== remaining relevant services =="
systemctl --no-pager --plain list-units --type=service --state=running \
  | egrep -i 'ssh|fail2ban|ufw|stubby|certbot|docker|nginx|landing|remna' || true

echo "== remaining docker containers =="
docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' || true

echo "cleanup complete"
