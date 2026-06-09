#!/usr/bin/env sh
set -eu

echo "== removing landing-lite container and files =="
docker rm -f landing-lite 2>/dev/null || true
rm -rf /opt/landing-lite

echo "== stopping and disabling stubby =="
systemctl stop stubby 2>/dev/null || true
systemctl disable stubby 2>/dev/null || true
apt-get purge -y stubby 2>/dev/null || true
rm -rf /etc/stubby

echo "== remaining containers =="
docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}'

echo "== remaining /opt dirs =="
find /opt -maxdepth 2 -mindepth 1 -type d 2>/dev/null | sort

echo "cleanup complete"
