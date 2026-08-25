#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const vars = readFileSync(
  path.join(repoRoot, '.private/ansible/prod/host_vars/home.himenkov.ru/secondbrain.yml'),
  'utf8',
);
const match = vars.match(/^secondbrain_couchdb_password:\s*["']?([^"'\n]+)["']?\s*$/m);
if (!match) throw new Error('CouchDB password is missing from private inventory.');

const auth = Buffer.from(`secondbrain:${match[1].trim()}`).toString('base64');
const response = await fetch('https://sync.himenkov.ru:15984/secondbrain', {
  headers: { Authorization: `Basic ${auth}` },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`CouchDB returned HTTP ${response.status}.`);
const info = await response.json();
console.log(
  JSON.stringify({
    database: info.db_name,
    documents: info.doc_count,
    deletedDocuments: info.doc_del_count,
    updateSequence: info.update_seq,
  }),
);
