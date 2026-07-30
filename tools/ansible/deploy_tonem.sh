#!/usr/bin/env bash
set -euo pipefail

SCRIPTPATH="$(cd "$(dirname "$0")" >/dev/null 2>&1; pwd -P)"
ROOT_DIR="$(cd "$SCRIPTPATH/../.." >/dev/null 2>&1; pwd -P)"

PLAYBOOK="tonem"
PLAYBOOK_FILE="${ROOT_DIR}/infra/ansible/playbooks/${PLAYBOOK}.yml"
ANSIBLE_ROLES_PATH="${ROOT_DIR}/infra/ansible/roles"
INVENTORY="${ROOT_DIR}/.private/ansible/prod/hosts.yml"
LOG_DIR="${ROOT_DIR}/ansible-logs"

# --- argument parsing ---
CHECK_MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      CHECK_MODE="--check"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--check]"
      exit 1
      ;;
  esac
done

# --- pre-flight ---
if [ ! -f "$PLAYBOOK_FILE" ]; then
  echo "ERROR: playbook not found: $PLAYBOOK_FILE"
  exit 1
fi

if [ ! -f "$INVENTORY" ]; then
  echo "ERROR: inventory not found: $INVENTORY"
  echo "Make sure .private/ansible/prod/hosts.yml exists."
  exit 1
fi

# --- check for placeholder secrets ---
if grep -rn "########" "$ROOT_DIR/deployments/tonem/.env" > /dev/null 2>&1; then
  echo "ERROR: deployments/tonem/.env contains ######## placeholders."
  exit 1
fi

if grep -rn "########" "$INVENTORY" > /dev/null 2>&1; then
  echo "ERROR: inventory contains ######## placeholders."
  echo "Fill in .private/ansible/prod/hosts.yml first."
  exit 1
fi

# --- run ---
mkdir -p "$LOG_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/tonem_${TIMESTAMP}.log"

export ANSIBLE_ROLES_PATH
export ANSIBLE_HOST_KEY_CHECKING=False

echo "=== Deploying tonem to master ==="
echo "Playbook: $PLAYBOOK_FILE"
echo "Inventory: $INVENTORY"
echo "Log: $LOG_FILE"
echo ""

set +e
ansible-playbook \
  -i "$INVENTORY" \
  --forks 1 \
  -e "repo_root=${ROOT_DIR}" \
  $CHECK_MODE \
  "$PLAYBOOK_FILE" 2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}
set -e

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✓ Tonem deploy complete"
else
  echo ""
  echo "✗ Tonem deploy FAILED (exit $EXIT_CODE). See log: $LOG_FILE"
fi

exit $EXIT_CODE
