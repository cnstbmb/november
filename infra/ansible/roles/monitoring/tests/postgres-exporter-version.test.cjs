const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const defaults = fs.readFileSync(path.join(__dirname, '..', 'defaults', 'main.yml'), 'utf8');

assert.match(
  defaults,
  /^monitoring_tonem_postgres_exporter_image: "quay\.io\/prometheuscommunity\/postgres-exporter:v0\.20\.1"$/m,
  'postgres_exporter must include the v0.20.1 stat_replication slot_name fix',
);

console.log('Tonem postgres_exporter includes the stat_replication fix.');
