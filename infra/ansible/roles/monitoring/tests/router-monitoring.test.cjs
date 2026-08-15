const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const roleRoot = path.join(__dirname, '..');
const prometheusTemplate = fs.readFileSync(
  path.join(roleRoot, 'templates', 'prometheus.yml.j2'),
  'utf8',
);
const monitoringDefaults = fs.readFileSync(
  path.join(roleRoot, 'defaults', 'main.yml'),
  'utf8',
);
const monitoringTasks = fs.readFileSync(
  path.join(roleRoot, 'tasks', 'main.yml'),
  'utf8',
);
const routerRoutePath = path.join(
  roleRoot,
  'templates',
  'monitoring-router-route.service.j2',
);

assert.match(
  monitoringDefaults,
  /^monitoring_router_targets: \[\]$/m,
  'router scrape targets must be opt-in and supplied by private inventory',
);
assert.doesNotMatch(
  monitoringDefaults,
  /home_exit_wg|routerich|192\.168\.|10\.\d+\.\d+\.\d+/i,
  'role defaults must not expose the production router topology',
);

const routerTargetsBlock = prometheusTemplate.match(
  /\{% for router in monitoring_router_targets[\s\S]*?\{% endfor %\}/,
)?.[0] || '';

assert.match(routerTargetsBlock, /"\{\{ router\.target \}\}"/);
assert.match(routerTargetsBlock, /host: "\{\{ router\.host \}\}"/);
assert.match(routerTargetsBlock, /role: "router"/);
assert.doesNotMatch(
  routerTargetsBlock,
  /groups\['workers'\]/,
  'OpenWrt routers must not be treated as Docker-capable workers',
);

const dashboardPath = path.join(roleRoot, 'templates', 'dashboard-router.json.j2');
const alertingPath = path.join(roleRoot, 'templates', 'grafana-router-alerting.yml.j2');
assert.ok(fs.existsSync(dashboardPath), 'router dashboard must be provisioned');
assert.ok(fs.existsSync(alertingPath), 'router managed alerting must be provisioned');

const dashboardTemplate = fs.readFileSync(dashboardPath, 'utf8');
const alertingTemplate = fs.readFileSync(alertingPath, 'utf8');
const renderVariables = (value) =>
  value
    .replaceAll('{{ monitoring_grafana_prometheus_uid }}', 'prometheus')
    .replaceAll('{{ monitoring_router_name }}', 'test-router')
    .replaceAll('{{ monitoring_router_dashboard_url }}', 'https://grafana.example/router')
    .replaceAll('{{ monitoring_router_temperature_critical_celsius }}', '85')
    .replaceAll('{{ monitoring_router_memory_available_critical_bytes }}', '134217728')
    .replaceAll('{{ monitoring_router_zeroblock_rss_warning_bytes }}', '157286400')
    .replaceAll('{{ monitoring_router_zeroblock_swap_warning_bytes }}', '16777216')
    .replaceAll("{{ '{{device}}' }}", '{{device}}')
    .replaceAll("{{ '{{state}}' }}", '{{state}}');

const dashboard = JSON.parse(renderVariables(dashboardTemplate));
assert.equal(dashboard.uid, 'november-router');
assert.equal(dashboard.title, 'Router / Zeroblock');
const alerting = yaml.load(renderVariables(alertingTemplate));
const alertRules = alerting.groups.flatMap((group) => group.rules);
for (const rule of alertRules) {
  assert.equal(rule.condition, 'B', `${rule.uid} must evaluate expression B`);
  assert.ok(rule.annotations.dashboard_url, `${rule.uid} must link to the dashboard`);
}
const pressureExpr = alertRules.find((rule) => rule.uid === 'router-zeroblock-pressure').data[0]
  .model.expr;
assert.match(
  pressureExpr,
  /pressure_samples[\s\S]* \+ [\s\S]*zeroblock_rss_bytes[\s\S]* \+ [\s\S]*zeroblock_swap_bytes/,
  'pressure signals must be combined numerically; PromQL set union would hide right-hand values',
);

for (const metric of [
  'node_hwmon_temp_celsius',
  'node_thermal_zone_temp',
  'node_memory_MemAvailable_bytes',
  'node_memory_SwapTotal_bytes',
  'node_network_receive_bytes_total',
  'zeroblock_rss_bytes',
  'zeroblock_swap_bytes',
  'zeroblock_watchdog_state',
]) {
  assert.match(dashboardTemplate, new RegExp(metric), `${metric} must be visible on the router dashboard`);
}
assert.doesNotMatch(
  dashboardTemplate,
  /mountpoint=\\?"\/\\?"/,
  'router dashboard must not assume OpenWrt overlay root is a normal filesystem',
);

for (const uid of [
  'router-down',
  'router-temperature-critical',
  'router-memory-critical',
  'router-zeroblock-down',
  'router-zeroblock-pressure',
]) {
  assert.match(alertingTemplate, new RegExp(`uid: ${uid}`), `${uid} must be provisioned`);
}
assert.match(alertingTemplate, /state=~\\?"paused\|blocked\\?"/);
assert.match(monitoringTasks, /Render router Grafana dashboard/);
assert.match(monitoringTasks, /Render router Grafana managed alerting/);
assert.match(monitoringTasks, /Remove disabled router Grafana managed alerting/);
assert.match(
  monitoringDefaults,
  /^monitoring_router_name: ""$/m,
  'the production router name must come from private inventory',
);
assert.match(monitoringDefaults, /^monitoring_router_alerting_enabled: false$/m);

assert.ok(fs.existsSync(routerRoutePath), 'router WireGuard host route must be persistent');
const routerRouteTemplate = fs.readFileSync(routerRoutePath, 'utf8');
assert.match(routerRouteTemplate, /After=.*wg-quick@\{\{ monitoring_router_route_interface \}\}\.service/);
assert.match(routerRouteTemplate, /PartOf=wg-quick@\{\{ monitoring_router_route_interface \}\}\.service/);
assert.match(
  routerRouteTemplate,
  /ip route replace \{\{ monitoring_router_route_destination \}\} dev \{\{ monitoring_router_route_interface \}\}/,
);
assert.match(routerRouteTemplate, /ip route del \{\{ monitoring_router_route_destination \}\}/);
assert.match(monitoringDefaults, /^monitoring_router_route_enabled: false$/m);
assert.match(monitoringDefaults, /^monitoring_router_route_interface: ""$/m);
assert.match(monitoringDefaults, /^monitoring_router_route_destination: ""$/m);
assert.match(monitoringTasks, /Validate router WireGuard host route/);
assert.match(monitoringTasks, /Render router WireGuard host-route service/);
assert.match(monitoringTasks, /Enable router WireGuard host route/);
assert.match(
  monitoringTasks,
  /Render monitoring configs[\s\S]{0,700}?tags: \[monitoring_router\]/,
  'router-only deploy must render the Prometheus scrape target',
);
assert.match(
  monitoringTasks,
  /Restart Prometheus after router scrape config change[\s\S]{0,900}?docker compose restart prometheus[\s\S]{0,900}?tags: \[monitoring_router\]/,
  'router-only deploy must activate the Prometheus scrape target without recreating the stack',
);

console.log('Router Prometheus target invariants are valid.');
