#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMNAWAVE_RENDERER_PATCH_REMOTE:-root@193.124.64.187}"
CONTAINER="${REMNAWAVE_RENDERER_PATCH_CONTAINER:-remnawave}"
APPLY="false"

if [ "${1:-}" = "--apply" ]; then
  APPLY="true"
elif [ -n "${1:-}" ]; then
  printf 'Unknown argument: %s\n' "$1" >&2
  exit 2
fi

backup_dir=""
if [ "${APPLY}" = "true" ]; then
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  backup_dir="/root/remnawave-hysteria2-renderer-${stamp}"
  ssh "${REMOTE}" "mkdir -p '${backup_dir}' && docker cp '${CONTAINER}:/opt/app/dist/src/modules/subscription-template/generators/xray.generator.service.js' '${backup_dir}/xray.generator.service.js.before'"
fi

result="$({
  ssh "${REMOTE}" "docker exec -e APPLY='${APPLY}' -i '${CONTAINER}' node" <<'NODE'
const fs = require('fs');

const file = '/opt/app/dist/src/modules/subscription-template/generators/xray.generator.service.js';
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('    buildHysteria2Link(host) {');
const end = source.indexOf('    applyTransportParams(params, host) {', start);
if (start < 0 || end < 0) {
  throw new Error('The Hysteria2 Xray share-link builder was not found');
}

const builder = source.slice(start, end);
const marker = 'params.alpn = host.securityOptions.alpn;';
const alreadyPatched = builder.includes(marker);
const apply = process.env.APPLY === 'true';

if (!alreadyPatched && apply) {
  const needle = [
    '            if (host.securityOptions.pinnedPeerCertSha256) {',
    '                params.pinSHA256 = host.securityOptions.pinnedPeerCertSha256;',
    '            }',
  ].join('\n');
  if (!builder.includes(needle)) {
    throw new Error('Expected pinnedPeerCertSha256 block was not found in Hysteria2 builder');
  }
  const replacement = [
    '            if (host.securityOptions.alpn) {',
    '                params.alpn = host.securityOptions.alpn;',
    '            }',
    needle,
  ].join('\n');
  fs.writeFileSync(file, source.slice(0, start) + builder.replace(needle, replacement) + source.slice(end));
}

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'check',
  alreadyPatched,
  patchRequired: !alreadyPatched,
  target: 'Hysteria2 Xray share-link ALPN',
}));
NODE
} 2>&1)"

printf '%s\n' "${result}"

if [ "${APPLY}" != "true" ]; then
  exit 0
fi

if ! printf '%s' "${result}" | grep -q '"alreadyPatched":true'; then
  ssh "${REMOTE}" "docker restart '${CONTAINER}' >/dev/null"
  printf 'Patched renderer; original backup: %s\n' "${backup_dir}"
else
  printf 'Renderer already patched; backup: %s\n' "${backup_dir}"
fi
