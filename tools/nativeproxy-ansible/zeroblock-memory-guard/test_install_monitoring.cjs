const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const installerPath = path.join(__dirname, 'install-monitoring.sh');
assert.ok(fs.existsSync(installerPath), 'an operator-safe OpenWrt installer must exist');

const installer = fs.readFileSync(installerPath, 'utf8');
const audit = fs.readFileSync(path.join(__dirname, 'audit.sh'), 'utf8');
assert.match(installer, /--apply/, 'mutations must require an explicit --apply flag');
assert.match(installer, /OPENWRT_PROMETHEUS_INTERFACE/);
assert.match(installer, /OPENWRT_PROMETHEUS_FIREWALL_ZONE/);
assert.match(installer, /OPENWRT_PROMETHEUS_SOURCE_CIDR/);
assert.match(installer, /\/tmp\/prometheus/);
assert.match(installer, /readlink -f \/var\/prometheus/);
assert.match(installer, /prometheus-node-exporter-lua-hwmon/);
assert.match(installer, /prometheus-node-exporter-lua-thermal/);
assert.match(installer, /prometheus-node-exporter-lua-textfile/);
assert.match(installer, /zeroblock-monitoring-backup-/);
assert.match(installer, /Refusing wildcard Prometheus binding/);
assert.match(installer, /Unknown UCI network interface/);
assert.match(installer, /does not include network interface/);
assert.match(installer, /must be one IPv4 \/32/);
assert.doesNotMatch(
  installer,
  /listen_interface ['"]?\*|listen_interface=['"]?\*/,
  'the exporter must never bind every router interface',
);
assert.match(audit, /prometheus-node-exporter-lua enabled/);
assert.match(audit, /\/tmp\/prometheus\/zeroblock\.prom/);
assert.match(audit, /zeroblock_rss_bytes/);

console.log('OpenWrt monitoring installer safety invariants are valid.');
