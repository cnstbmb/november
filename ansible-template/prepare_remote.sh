#!/usr/bin/env sh
set -eu

# Prepare a remote host to run Ansible locally from this host.
# Usage:
#   REPO_URL="########" REPO_DIR="/opt/november" \
#   BRANCH="main" \
#   sudo sh ansible/prepare_remote.sh

REPO_URL="${REPO_URL:-}"
REPO_DIR="${REPO_DIR:-/opt/november}"
BRANCH="${BRANCH:-main}"

if [ -z "${REPO_URL}" ]; then
  echo "REPO_URL is required (git repo URL)."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root or with sudo."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ansible git python3

if [ ! -d "${REPO_DIR}/.git" ]; then
  rm -rf "${REPO_DIR}"
  git clone --filter=blob:none --no-checkout --branch "${BRANCH}" "${REPO_URL}" "${REPO_DIR}"
  cd "${REPO_DIR}"
  git sparse-checkout init --cone
  git sparse-checkout set ansible deployments/prod
  git checkout
else
  git -C "${REPO_DIR}" fetch --all
  git -C "${REPO_DIR}" checkout "${BRANCH}"
  git -C "${REPO_DIR}" sparse-checkout init --cone
  git -C "${REPO_DIR}" sparse-checkout set ansible deployments/prod
  git -C "${REPO_DIR}" pull --ff-only
fi

echo "Repo prepared in ${REPO_DIR}. Edit inventory/group_vars locally before running playbooks."
