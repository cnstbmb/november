#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONFIG_FILE="${TONEM_XHTTP_CONFIG_FILE:-${ROOT_DIR}/.private/ansible/prod/remnawave-tonem-xhttp.json}"
MODE="${1:-}"

if [ "$#" -ne 1 ] || { [ "${MODE}" != "--check" ] && [ "${MODE}" != "--apply" ]; }; then
  echo "Usage: $0 --check|--apply" >&2
  exit 1
fi

for command in jq node; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required" >&2
    exit 1
  fi
done

node "${ROOT_DIR}/tools/ansible/remnawave/prepare_tonem_xhttp.mjs" --ready >/dev/null

if [ "${MODE}" = "--check" ]; then
  "${ROOT_DIR}/tools/ansible/run_prod_private.sh" \
    --playbook remnawave-panel \
    --limit master \
    --check
else
  "${ROOT_DIR}/tools/ansible/run_prod_private.sh" \
    --playbook remnawave-panel \
    --limit master
fi

run_playbook() {
  target="$1"
  inventory_target="$2"
  check_arg=""
  if [ "${MODE}" = "--check" ]; then
    check_arg="--check"
  fi

  if [ "${target}" = "moscow" ]; then
    "${ROOT_DIR}/tools/ansible/run_prod_private.sh" \
      --playbook remnawave-tonem-xhttp-master \
      --limit "${inventory_target}" \
      ${check_arg}
  else
    "${ROOT_DIR}/tools/ansible/run_prod_private.sh" \
      --playbook remnawave-tonem-xhttp-edge \
      --limit "${inventory_target}" \
      --ask-become-pass \
      --extra-vars "tonem_xhttp_inventory_target=${inventory_target}" \
      --extra-vars "tonem_xhttp_target_name=${target}" \
      ${check_arg}
  fi

  if [ "${MODE}" = "--apply" ]; then
    "${ROOT_DIR}/tools/ansible/remnawave/audit_tonem_xhttp_facades.sh" --target "${target}"
  fi
}

while IFS=$'\t' read -r target enabled inventory_target; do
  if [ "${enabled}" != "true" ]; then
    echo "SKIP ${target}: disabled in private state"
    continue
  fi
  if [ -z "${inventory_target}" ]; then
    echo "FAIL ${target}: inventoryTarget is missing" >&2
    exit 1
  fi
  echo "ROLL ${target}: ${MODE}"
  run_playbook "${target}" "${inventory_target}"
done < <(
  jq -r '.rolloutOrder[] as $name | [$name, (.targets[$name].enabled | tostring), .targets[$name].inventoryTarget] | @tsv' "${CONFIG_FILE}"
)

echo "TONEM XHTTP sequential ${MODE#--} completed."
