const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const roleRoot = path.join(__dirname, '..');
const template = (name) => fs.readFileSync(path.join(roleRoot, 'templates', name), 'utf8');

const backup = template('tonem-analytics-backup.sh.j2');
const restore = template('tonem-analytics-restore-check.sh.j2');
const retention = template('tonem-analytics-retention.sh.j2');
const backupTimer = template('tonem-analytics-backup.timer.j2');
const restoreTimer = template('tonem-analytics-restore-check.timer.j2');
const retentionTimer = template('tonem-analytics-retention.timer.j2');

assert.match(backup, /\.dump\.tmp/);
assert.match(backup, /test -s "\$\{tmp\}"[\s\S]*mv "\$\{tmp\}" "\$\{daily\}"/);
assert.match(backup, /restic backup[\s\S]*--tag umami/);
assert.match(backup, /restic forget --prune[\s\S]*--keep-daily 7 --keep-weekly 4 --keep-monthly 12/);
assert.match(backup, /tonem_analytics_backup_last_success_timestamp_seconds/);

assert.match(restore, /trap finish EXIT INT TERM/);
assert.match(restore, /docker rm -f "\$\{container\}"[\s\S]*docker run -d/);
assert.match(restore, /--network none/);
assert.match(restore, /pg_restore[\s\S]*table_count=/);
assert.match(restore, /tonem_analytics_restore_check_last_run_status/);

assert.match(retention, /psql -v ON_ERROR_STOP=1/);
assert.match(retention, /tonem_analytics_retention_last_success_timestamp_seconds/);
for (const timer of [backupTimer, restoreTimer, retentionTimer]) {
  assert.match(timer, /Persistent=true/);
  assert.match(timer, /WantedBy=timers\.target/);
}

console.log('Tonem analytics backup, restore and retention lifecycle invariants are valid.');
