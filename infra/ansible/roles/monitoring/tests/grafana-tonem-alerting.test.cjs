const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const templatePath = path.join(
  __dirname,
  '..',
  'templates',
  'grafana-tonem-alerting.yml.j2',
);
const template = fs.readFileSync(templatePath, 'utf8');
const telegramTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'grafana-telegram-contact-points.yml.j2'),
  'utf8',
);
const publicStatusRulesTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'public-status-rules.yml.j2'),
  'utf8',
);
const monitoringTasks = fs.readFileSync(
  path.join(__dirname, '..', 'tasks', 'main.yml'),
  'utf8',
);
const monitoringComposeTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'docker-compose.yml.j2'),
  'utf8',
);
const watchdogTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'tonem-monitoring-watchdog.sh.j2'),
  'utf8',
);
const lokiIngressTemplate = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'nginx-loki-ingest.conf.j2'),
  'utf8',
);
const chatIdValues = [...telegramTemplate.matchAll(/^\s+chatid:\s*(.+)$/gm)].map(
  ([, value]) => value,
);
const numericChatId = '-1001234567890';

assert.equal(chatIdValues.length, 2, 'both Telegram contact points must be tested');

for (const value of chatIdValues) {
  assert.equal(
    value,
    '{{ monitoring_alerting_telegram_chat_id | string | to_json }}',
    'chatid must be rendered directly because Grafana coerces numeric env values',
  );

  const renderedValue = JSON.stringify(numericChatId);
  const parsed = yaml.load(`chatid: ${renderedValue}`);

  assert.equal(
    typeof parsed.chatid,
    'string',
    'Grafana Telegram chatid must be a YAML string',
  );
  assert.equal(parsed.chatid, numericChatId);
}

assert.match(
  template,
  /node_filesystem_avail_bytes\{role="master",mountpoint="\/"/,
  'disk alert must inspect only the master root filesystem',
);
assert.doesNotMatch(
  template,
  /min\(node_filesystem_avail_bytes\{role="master",fstype/,
  'disk alert must not take the minimum across unrelated small filesystems',
);
assert.match(
  template,
  /tonem_analytics_restore_check_last_run_status/,
  'Umami restore-check failures must be alertable',
);
assert.doesNotMatch(
  template,
  /query: \{params: \[C\]\}/,
  'Grafana condition C must not reference itself',
);

const alertRuleBlocks = template
  .split(/(?=^      - uid: tonem-)/m)
  .filter((block) => /^      - uid: tonem-/m.test(block));

for (const block of alertRuleBlocks.filter((value) => /type: classic_conditions/.test(value))) {
  const uid = block.match(/^      - uid: (\S+)/m)?.[1] || 'unknown';
  assert.match(
    block,
    /^        condition: B$/m,
    `${uid}: classic condition must use refId B (Grafana rejects a classic condition at C as self-referencing)`,
  );
  assert.match(block, /^          - refId: B$/m, `${uid}: expression refId must be B`);
  assert.doesNotMatch(block, /^          - refId: C$/m, `${uid}: classic expression must not use C`);
}
assert.match(
  template,
  /sum\(increase\(tonem_frontend_errors_total\[5m\]\)\) or vector\(0\)/,
  'the frontend error rule must evaluate an empty series as zero',
);
const alertingRenderTask = monitoringTasks.match(
  /- name: Render Tonem Grafana managed alerting[\s\S]*?(?=\n- name:)/,
)?.[0] || '';
assert.doesNotMatch(
  alertingRenderTask,
  /^\s+backup: true$/m,
  'Ansible backups must not be written into Grafana provisioning directories',
);
assert.match(
  publicStatusRulesTemplate,
  /public_channel_status[\s\S]*?area: local[\s\S]*?xray_proxy_status\{name="HOME"\}\) or vector\(0\)/,
  'the local public channel must follow the current HOME host exported by xray-checker',
);
assert.doesNotMatch(
  publicStatusRulesTemplate,
  /xray_proxy_status\{name="MOSCOW HOME WIFI"\}/,
  'the removed MOSCOW HOME WIFI host must not leave the local channel without data',
);
assert.match(
  monitoringTasks,
  /grafana-public\/provisioning\/alerting/,
  'public Grafana must have an alerting provisioning directory',
);
assert.match(
  monitoringTasks,
  /grafana-public\/provisioning\/plugins/,
  'public Grafana must have a plugin provisioning directory',
);
assert.match(
  monitoringTasks,
  /grafana\/provisioning\/plugins/,
  'private Grafana must have a plugin provisioning directory',
);
assert.match(
  monitoringComposeTemplate,
  /HTTPS_PROXY=\{\{ monitoring_alerting_telegram_proxy_url \}\}/,
  'Grafana must use the configured Telegram proxy when direct Telegram access is unavailable',
);
assert.match(
  monitoringComposeTemplate,
  /127\.0\.0\.1:\{\{ monitoring_prometheus_port \}\}:9090/,
  'Prometheus must bind only to loopback',
);
assert.match(
  monitoringComposeTemplate,
  /127\.0\.0\.1:\{\{ monitoring_loki_loopback_port \}\}:3100/,
  'Loki must expose its HTTP API only through a loopback port',
);
assert.match(
  lokiIngressTemplate,
  /location = \/loki\/api\/v1\/push[\s\S]*?deny all;/,
  'the Loki ingress proxy must allow only the push endpoint and trusted sources',
);
assert.doesNotMatch(telegramTemplate, /type: email/, 'Grafana alerting must be Telegram-only');
assert.match(
  telegramTemplate,
  /deleteContactPoints:[\s\S]*?uid: tonem-critical-email/,
  'Grafana provisioning must remove the legacy email receiver',
);
assert.match(
  monitoringTasks,
  /GF_SMTP_ENABLED=false/,
  'Grafana SMTP must remain permanently disabled',
);
assert.match(
  monitoringTasks,
  /Wait for Grafana after Telegram credential rotation[\s\S]*?until: monitoring_grafana_health_after_alerting_restart\.status/,
  'alerting provisioning reload must wait for Grafana after a credential restart',
);
assert.match(
  monitoringTasks,
  /path: \/etc\/nginx\/sites-enabled\/default[\s\S]*?state: absent/,
  'the Loki ingress nginx must not enable the conflicting default HTTP site',
);
assert.match(
  watchdogTemplate,
  /--proxy "\$\{TELEGRAM_PROXY_URL\}"/,
  'the out-of-band watchdog must use the same Telegram proxy',
);

const backupPrepareTemplate = fs.readFileSync(
  path.join(__dirname, '..', '..', 'backups', 'templates', 'restic-backup-prepare.sh.j2'),
  'utf8',
);
const resticBackupTemplate = fs.readFileSync(
  path.join(__dirname, '..', '..', 'backups', 'templates', 'restic-backup.sh.j2'),
  'utf8',
);

assert.match(backupPrepareTemplate, /docker pause/, 'monitoring snapshots must pause each data writer');
assert.match(backupPrepareTemplate, /trap resume_paused_container/, 'paused containers must be resumed after failures');
assert.match(resticBackupTemplate, /backup_monitoring_prepare_dir/, 'monitoring snapshots must be included in Restic');
assert.match(
  resticBackupTemplate,
  /tonem_monitoring_backup_last_success_timestamp_seconds/,
  'successful monitoring backups must expose a freshness metric',
);

console.log('Grafana Tonem alerting and S3 backup invariants are valid.');
