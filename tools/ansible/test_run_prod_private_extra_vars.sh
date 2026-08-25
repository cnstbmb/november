#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

mkdir -p "${TEST_DIR}/bin"
touch "${TEST_DIR}/inventory.yml" "${TEST_DIR}/playbook.yml"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "<%s>\n" "$@"' \
  > "${TEST_DIR}/bin/ansible-playbook"
chmod +x "${TEST_DIR}/bin/ansible-playbook"

run_wrapper() {
  PATH="${TEST_DIR}/bin:${PATH}" \
    ANSIBLE_INVENTORY_PATH="${TEST_DIR}/inventory.yml" \
    ANSIBLE_LOCAL_TEMP="${TEST_DIR}/ansible-local" \
    ANSIBLE_YUBIKEY_PRELOAD=false \
    ANSIBLE_RUN_SSH_COMMON_ARGS="" \
    "${ROOT_DIR}/tools/ansible/run_prod_private.sh" \
      --playbook "${TEST_DIR}/playbook.yml" \
      "$@"
}

without_extra_vars="$(run_wrapper)"
if printf '%s\n' "${without_extra_vars}" | grep -Fq '<--extra-vars>'; then
  echo "FAIL: zero-extra-vars invocation unexpectedly emitted --extra-vars" >&2
  exit 1
fi

with_extra_vars="$(run_wrapper --extra-vars 'first=value with spaces' -e second=value)"
for expected in '<--extra-vars>' '<first=value with spaces>' '<second=value>'; do
  if ! printf '%s\n' "${with_extra_vars}" | grep -Fq "${expected}"; then
    echo "FAIL: missing argument ${expected}" >&2
    exit 1
  fi
done

echo "PASS: run_prod_private handles zero and multiple extra vars under macOS Bash 3.2"
