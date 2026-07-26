#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMNAWAVE_RENDERER_PATCH_REMOTE:-root@5.42.111.142}"
CONTAINER="${REMNAWAVE_RENDERER_PATCH_CONTAINER:-remnawave}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
REMOTE_BACKUP_DIR="/root/remnawave-hysteria2-renderers-${STAMP}"

ssh "${REMOTE}" "mkdir -p '${REMOTE_BACKUP_DIR}' && \
  docker cp '${CONTAINER}:/opt/app/dist/src/modules/subscription-template/generators/xray.generator.service.js' '${REMOTE_BACKUP_DIR}/xray.generator.service.js' && \
  docker cp '${CONTAINER}:/opt/app/dist/src/modules/subscription-template/generators/singbox.generator.service.js' '${REMOTE_BACKUP_DIR}/singbox.generator.service.js' && \
  docker cp '${CONTAINER}:/opt/app/dist/src/modules/subscription-template/generators/mihomo.generator.service.js' '${REMOTE_BACKUP_DIR}/mihomo.generator.service.js'"

ssh "${REMOTE}" "docker exec -i '${CONTAINER}' node" <<'NODE'
const fs = require('fs');

function lines(parts) {
  return `${parts.join('\n')}\n`;
}

function patchFile(file, replacements) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [needle, replacement] of replacements) {
    if (!text.includes(needle)) {
      throw new Error(`${file}: expected snippet not found: ${needle.slice(0, 120)}`);
    }
    text = text.replace(needle, replacement);
  }
  fs.writeFileSync(file, text);
}

patchFile('/opt/app/dist/src/modules/subscription-template/generators/xray.generator.service.js', [
  [
    lines([
      "            case 'shadowsocks':",
      '                return this.buildShadowsocksLink(host);',
      '            default:',
      '                return null;',
    ]),
    lines([
      "            case 'shadowsocks':",
      '                return this.buildShadowsocksLink(host);',
      "            case 'hysteria':",
      '                return this.buildHysteria2Link(host);',
      '            default:',
      '                return null;',
    ]),
  ],
  [
    lines(['    applyTransportParams(params, host) {']),
    lines([
      '    buildHysteria2Link(host) {',
      '        const params = {};',
      '        const opts = host.securityOptions || {};',
      '        if (opts.serverName) {',
      '            params.sni = opts.serverName;',
      '        }',
      '        if (opts.fingerprint) {',
      '            params.fp = opts.fingerprint;',
      '        }',
      '        if (opts.alpn) {',
      '            params.alpn = opts.alpn;',
      '        }',
      '        if (opts.allowInsecure) {',
      '            params.insecure = 1;',
      '        }',
      '        const query = this.buildQueryString(params);',
      '        const remark = encodeURIComponent(host.finalRemark);',
      '        const auth = encodeURIComponent(host.transportOptions.auth);',
      "        return 'hysteria2://' + auth + '@' + host.address + ':' + host.port + '?' + query + '#' + remark;",
      '    }',
      '    applyTransportParams(params, host) {',
    ]),
  ],
]);

patchFile('/opt/app/dist/src/modules/subscription-template/generators/singbox.generator.service.js', [
  [
    lines([
      "const UNSUPPORTED_TRANSPORTS = new Set(['hysteria', 'kcp', 'xhttp']);",
      "const PROXY_PROTOCOL_TYPES = new Set(['hysteria', 'shadowsocks', 'trojan', 'vless']);",
      "const SELECTOR_TYPES = new Set(['shadowsocks', 'trojan', 'urltest', 'vless']);",
    ]),
    lines([
      "const UNSUPPORTED_TRANSPORTS = new Set(['kcp', 'xhttp']);",
      "const PROXY_PROTOCOL_TYPES = new Set(['hysteria2', 'shadowsocks', 'trojan', 'vless']);",
      "const SELECTOR_TYPES = new Set(['hysteria2', 'shadowsocks', 'trojan', 'urltest', 'vless']);",
    ]),
  ],
  [
    lines([
      '                type: host.protocol,',
      '                tag: host.finalRemark,',
    ]),
    lines([
      "                type: host.protocol === 'hysteria' ? 'hysteria2' : host.protocol,",
      '                tag: host.finalRemark,',
    ]),
  ],
  [
    lines([
      "            case 'shadowsocks':",
      '                config.password = host.protocolOptions.password;',
      '                config.method = host.protocolOptions.method;',
      "                config.network = 'tcp';",
      '                config.udp_over_tcp = {',
      '                    enabled: host.protocolOptions.uot,',
      '                    version: host.protocolOptions.uotVersion,',
      '                };',
      '                return true;',
      '            default:',
      '                return false;',
    ]),
    lines([
      "            case 'shadowsocks':",
      '                config.password = host.protocolOptions.password;',
      '                config.method = host.protocolOptions.method;',
      "                config.network = 'tcp';",
      '                config.udp_over_tcp = {',
      '                    enabled: host.protocolOptions.uot,',
      '                    version: host.protocolOptions.uotVersion,',
      '                };',
      '                return true;',
      "            case 'hysteria':",
      '                config.password = host.transportOptions.auth;',
      '                return true;',
      '            default:',
      '                return false;',
    ]),
  ],
]);

patchFile('/opt/app/dist/src/modules/subscription-template/generators/mihomo.generator.service.js', [
  [
    lines([
      "const UNSUPPORTED_TRANSPORTS = new Set(['hysteria', 'kcp', 'xhttp']);",
      "const UNSUPPORTED_PROTOCOLS = new Set(['hysteria']);",
    ]),
    lines([
      "const UNSUPPORTED_TRANSPORTS = new Set(['kcp', 'xhttp']);",
      'const UNSUPPORTED_PROTOCOLS = new Set([]);',
    ]),
  ],
  [
    lines([
      '        this.applyTransportOpts(node, host);',
      "        node['client-fingerprint'] = this.resolveFingerprint(host);",
    ]),
    lines([
      '        this.applyTransportOpts(node, host);',
      "        if (host.protocol === 'hysteria') {",
      '            delete node.network;',
      '        }',
      "        node['client-fingerprint'] = this.resolveFingerprint(host);",
    ]),
  ],
  [
    lines([
      '    resolveClashType(protocol) {',
      "        return protocol === 'shadowsocks' ? 'ss' : protocol;",
      '    }',
    ]),
    lines([
      '    resolveClashType(protocol) {',
      "        if (protocol === 'shadowsocks') return 'ss';",
      "        if (protocol === 'hysteria') return 'hysteria2';",
      '        return protocol;',
      '    }',
    ]),
  ],
  [
    lines([
      "            case 'shadowsocks':",
      '                node.password = host.protocolOptions.password;',
      '                node.cipher = host.protocolOptions.method;',
      "                node['udp-over-tcp'] = host.protocolOptions.uot;",
      "                node['udp-over-tcp-version'] = host.protocolOptions.uotVersion;",
      '                return true;',
      '            default:',
      '                return false;',
    ]),
    lines([
      "            case 'shadowsocks':",
      '                node.password = host.protocolOptions.password;',
      '                node.cipher = host.protocolOptions.method;',
      "                node['udp-over-tcp'] = host.protocolOptions.uot;",
      "                node['udp-over-tcp-version'] = host.protocolOptions.uotVersion;",
      '                return true;',
      "            case 'hysteria':",
      '                node.password = host.transportOptions.auth;',
      '                return true;',
      '            default:',
      '                return false;',
    ]),
  ],
  [
    lines([
      "                if (node.type === 'trojan') {",
      "                    node.sni = opts.serverName ?? '';",
      '                }',
      '                else {',
      "                    node.servername = opts.serverName ?? '';",
      '                }',
    ]),
    lines([
      "                if (node.type === 'trojan' || node.type === 'hysteria2') {",
      "                    node.sni = opts.serverName ?? '';",
      '                }',
      '                else {',
      "                    node.servername = opts.serverName ?? '';",
      '                }',
    ]),
  ],
]);
NODE

ssh "${REMOTE}" "docker restart '${CONTAINER}' >/dev/null && echo '${REMOTE_BACKUP_DIR}'"
