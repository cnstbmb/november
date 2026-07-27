#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY_PATH="${ROOT_DIR}/.private/ansible/prod/hosts.yml"
CONFIG_DIR="${ROOT_DIR}/.private/ansible/prod/adguardhome"
CONFIG_PATH="${CONFIG_DIR}/AdGuardHome.yaml"
REMOTE_CONFIG_PATH="/opt/adguardhome/conf/AdGuardHome.yaml"
LOCAL_TMP="${ROOT_DIR}/.tmp/ansible-local"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ ! -f "${INVENTORY_PATH}" ]; then
  echo "Private inventory not found: ${INVENTORY_PATH}" >&2
  exit 1
fi

mkdir -p "${CONFIG_DIR}" "${LOCAL_TMP}"

if [ -f "${CONFIG_PATH}" ]; then
  cp -p "${CONFIG_PATH}" "${CONFIG_PATH}.bak.${TIMESTAMP}"
fi

ANSIBLE_CONFIG="${ROOT_DIR}/ansible.cfg" \
ANSIBLE_LOCAL_TEMP="${LOCAL_TMP}" \
ansible \
  -i "${INVENTORY_PATH}" \
  master \
  --become \
  --module-name ansible.builtin.fetch \
  --args "src=${REMOTE_CONFIG_PATH} dest=${CONFIG_PATH} flat=yes validate_checksum=yes"

chmod 600 "${CONFIG_PATH}"
shasum -a 256 "${CONFIG_PATH}"
echo "Saved canonical AdGuard Home config to ${CONFIG_PATH}"
