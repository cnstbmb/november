#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

STAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_AI_DIR="/opt/home-ai"
BROKER_UNIT="/etc/systemd/system/home-ai-action-broker.service"

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this script through sudo.\n' >&2
  exit 1
fi

for required in action_broker.py action-broker-client.js jarvis.js index.js; do
  if [[ ! -f "${STAGE_DIR}/${required}" ]]; then
    printf 'Missing staged file: %s\n' "${required}" >&2
    exit 1
  fi
done

install -o root -g root -m 0755 "${STAGE_DIR}/action_broker.py" "${HOME_AI_DIR}/action-broker.py"
install -o root -g root -m 0644 "${STAGE_DIR}/action-broker-client.js" "${HOME_AI_DIR}/bot-src/src/action-broker-client.js"
install -o root -g root -m 0644 "${STAGE_DIR}/jarvis.js" "${HOME_AI_DIR}/bot-src/src/jarvis.js"
install -o root -g root -m 0644 "${STAGE_DIR}/index.js" "${HOME_AI_DIR}/bot-src/src/index.js"

if grep -qx 'RestrictAddressFamilies=AF_UNIX' "${BROKER_UNIT}"; then
  sed -i 's/^RestrictAddressFamilies=AF_UNIX$/RestrictAddressFamilies=AF_UNIX AF_NETLINK/' "${BROKER_UNIT}"
fi
grep -qx 'RestrictAddressFamilies=AF_UNIX AF_NETLINK' "${BROKER_UNIT}"
systemctl daemon-reload
systemctl restart home-ai-action-broker.service
for _attempt in {1..30}; do
  [[ -S /run/home-ai/action-broker.sock ]] && break
  sleep 1
done
test -S /run/home-ai/action-broker.sock

cd "${HOME_AI_DIR}"
docker compose --project-name home-ai build bot
docker compose --project-name home-ai up -d --no-deps bot

token="$(<"${HOME_AI_DIR}/secrets/action_broker_token")"
for endpoint in status storage services network; do
  printf '\n== %s ==\n' "${endpoint}"
  curl --fail --silent --show-error \
    --unix-socket /run/home-ai/action-broker.sock \
    -H "Authorization: Bearer ${token}" \
    "http://localhost/v1/${endpoint}"
done
printf '\nStatus hotfix deployed.\n'
