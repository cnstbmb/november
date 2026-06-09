#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"

cd "$ROOT_DIR"
ANSIBLE_CONFIG=infra/nativeproxy-ansible/ansible.cfg \
  ansible-playbook infra/nativeproxy-ansible/playbooks/site.yml "$@"
