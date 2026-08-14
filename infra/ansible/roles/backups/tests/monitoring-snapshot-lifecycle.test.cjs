const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const roleRoot = path.join(__dirname, '..');
const prepare = fs.readFileSync(
  path.join(roleRoot, 'templates', 'restic-backup-prepare.sh.j2'),
  'utf8',
);
const backup = fs.readFileSync(path.join(roleRoot, 'templates', 'restic-backup.sh.j2'), 'utf8');
const restore = fs.readFileSync(
  path.join(roleRoot, 'templates', 'tonem-restore-check.sh.j2'),
  'utf8',
);

assert.match(prepare, /trap resume_paused_container EXIT INT TERM/);
assert.match(prepare, /docker pause "\$\{container_name\}"[\s\S]*docker cp[\s\S]*docker unpause/);
assert.match(prepare, /mv "\$\{monitoring_tmp_dir\}" "\$\{monitoring_final_dir\}"/);
assert.match(prepare, /trap - EXIT INT TERM/);
assert.match(backup, /restic backup[\s\S]*restic forget --prune/);
assert.match(backup, /tonem_monitoring_backup_last_success_timestamp_seconds/);
assert.match(restore, /trap finish EXIT INT TERM/);
assert.match(restore, /docker rm -f "\$\{container\}"[\s\S]*--network none/);
assert.match(restore, /pg_restore[\s\S]*table_count=/);

console.log('Monitoring snapshot and Tonem restore lifecycle invariants are valid.');
