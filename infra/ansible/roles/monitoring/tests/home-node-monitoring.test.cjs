const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const roleRoot = path.join(__dirname, '..');
const dashboardTemplate = fs.readFileSync(
  path.join(roleRoot, 'templates', 'dashboard-home-node.json.j2'),
  'utf8',
);
const alertingTemplate = fs.readFileSync(
  path.join(roleRoot, 'templates', 'grafana-home-node-alerting.yml.j2'),
  'utf8',
);
const monitoringTasks = fs.readFileSync(
  path.join(roleRoot, 'tasks', 'main.yml'),
  'utf8',
);
const monitoringDefaults = fs.readFileSync(
  path.join(roleRoot, 'defaults', 'main.yml'),
  'utf8',
);

const renderVariables = (value) =>
  value
    .replaceAll('{{ monitoring_grafana_prometheus_uid }}', 'prometheus')
    .replaceAll('{{ monitoring_home_node_name }}', 'home.himenkov.ru')
    .replaceAll('{{ monitoring_home_node_dashboard_url }}', 'https://grafana.example/home')
    .replaceAll('{{ monitoring_home_node_temperature_warning_celsius }}', '70')
    .replaceAll('{{ monitoring_home_node_temperature_critical_celsius }}', '80')
    .replaceAll('{{ monitoring_home_node_memory_warning_percent }}', '85')
    .replaceAll('{{ monitoring_home_node_memory_critical_percent }}', '95')
    .replaceAll('{{ monitoring_home_node_disk_free_warning_percent }}', '15')
    .replaceAll('{{ monitoring_home_node_disk_free_critical_percent }}', '7')
    .replaceAll('{{ monitoring_home_node_disk_free_warning_bytes }}', '10737418240')
    .replaceAll('{{ monitoring_home_node_disk_free_critical_bytes }}', '5368709120')
    .replaceAll("{{ '{{chip_name}}' }}", '{{chip_name}}');

const dashboard = JSON.parse(renderVariables(dashboardTemplate));
assert.equal(dashboard.uid, 'november-home-node');
assert.deepEqual(
  dashboard.panels.map(({ title }) => title),
  [
    'Maximum Temperature',
    'CPU Usage',
    'Memory Available',
    'Root Filesystem Available',
    'Temperature by Sensor',
    'CPU Usage',
    'Memory Usage',
    'Root Filesystem Available',
  ],
);
assert.match(
  dashboardTemplate,
  /node_memory_MemAvailable_bytes/,
  'memory panels must use MemAvailable instead of misleading raw free memory',
);
assert.match(
  dashboardTemplate,
  /node_hwmon_temp_celsius/,
  'dashboard must display the exported hardware temperatures',
);

const alerting = yaml.load(renderVariables(alertingTemplate));
const rules = alerting.groups.flatMap((group) => group.rules);
const ruleIds = new Set(rules.map(({ uid }) => uid));

for (const expected of [
  'home-node-down',
  'home-node-temperature-missing',
  'home-node-temperature-warning',
  'home-node-temperature-critical',
  'home-node-cpu-warning',
  'home-node-cpu-critical',
  'home-node-memory-warning',
  'home-node-memory-critical',
  'home-node-disk-warning',
  'home-node-disk-critical',
]) {
  assert.ok(ruleIds.has(expected), `${expected} must be provisioned`);
}

for (const rule of rules) {
  assert.equal(rule.condition, 'B', `${rule.uid} must evaluate expression B`);
  assert.ok(rule.annotations.dashboard_url, `${rule.uid} must link to the dashboard`);
  assert.match(rule.notification_settings.receiver, /^monitoring-(warning|critical)$/);
}

for (const uid of ['home-node-memory-warning', 'home-node-memory-critical']) {
  const query = rules.find((rule) => rule.uid === uid).data[0].model.expr;
  assert.match(query, /node_memory_MemAvailable_bytes/);
  assert.match(query, /node_memory_MemTotal_bytes/);
}

for (const uid of ['home-node-disk-warning', 'home-node-disk-critical']) {
  const query = rules.find((rule) => rule.uid === uid).data[0].model.expr;
  assert.match(query, /mountpoint="\/"/);
  assert.match(query, /node_filesystem_avail_bytes/);
  assert.match(query, /node_filesystem_size_bytes/);
}

assert.match(monitoringTasks, /Render home-node Grafana dashboard/);
assert.match(monitoringTasks, /Render home-node Grafana managed alerting/);
assert.match(
  monitoringDefaults,
  /^monitoring_home_node_name: ""$/m,
  'production node names must come from private inventory, not role defaults',
);
assert.doesNotMatch(
  monitoringDefaults,
  /home\.himenkov\.ru|95\.31\.244\.3/,
  'role defaults must not expose production topology',
);
assert.doesNotMatch(
  monitoringTasks.match(/- name: Validate home-node alerting integration[\s\S]*?(?=\n- name:)/)?.[0] || '',
  /monitoring_tonem_alerting_enabled/,
  'home-node alerts must not depend on Tonem alerting being enabled',
);
assert.match(
  monitoringTasks,
  /Reload Grafana alerting provisioning[\s\S]*?monitoring_alerting_enabled \| default\(false\) \| bool/,
  'Grafana provisioning must reload whenever managed alerting is enabled',
);

console.log('Home-node dashboard and alerting invariants are valid.');
