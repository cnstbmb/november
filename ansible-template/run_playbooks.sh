#!/usr/bin/env sh
set -eu

# Validate configs and run Ansible playbooks locally from this host.
# Usage:
#   REPO_DIR="/opt/november" \
#   INVENTORY_PATH="ansible/inventories/prod/hosts.yml" \
#   PLAYBOOK_PATH="ansible/playbooks/site.yml" \
#   sh ansible/run_playbooks.sh

REPO_DIR="${REPO_DIR:-/opt/november}"
INVENTORY_PATH="${INVENTORY_PATH:-ansible/inventories/prod/hosts.yml}"
PLAYBOOK_PATH="${PLAYBOOK_PATH:-ansible/playbooks/site.yml}"

if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "Repo not found in ${REPO_DIR}. Run prepare_remote.sh first."
  exit 1
fi

cd "${REPO_DIR}"

if [ ! -f "${INVENTORY_PATH}" ]; then
  echo "Inventory file not found: ${INVENTORY_PATH}"
  exit 1
fi

if [ ! -f "${PLAYBOOK_PATH}" ]; then
  echo "Playbook file not found: ${PLAYBOOK_PATH}"
  exit 1
fi

fail=0

check_file() {
  file="$1"
  if [ ! -f "$file" ]; then
    echo "Missing required file: $file"
    fail=1
    return
  fi

  lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    trimmed="$(printf "%s" "$line" | sed 's/^[[:space:]]*//')"
    case "$trimmed" in
      \#*) continue ;;
    esac
    case "$line" in
      *"########"*)
        echo "Placeholder found in $file:$lineno"
        fail=1
        ;;
    esac
  done < "$file"
}

FILES_TO_CHECK="$(find ansible/inventories/prod -type f \( -name "*.yml" -o -name "*.yaml" \) | sort)"
for file in $FILES_TO_CHECK; do
  check_file "$file"
done

if [ "$fail" -ne 0 ]; then
  echo "Fill or remove all ######## placeholders before running Ansible."
  exit 1
fi

ansible-playbook -i "${INVENTORY_PATH}" "${PLAYBOOK_PATH}"
