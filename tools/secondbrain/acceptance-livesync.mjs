#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const vault = '/Users/konstantin/Obsidian/SecondBrain';
const fixture = path.join(vault, '00 Inbox', 'LiveSync Acceptance Test.md');
const vars = readFileSync(
  path.join(repoRoot, '.private/ansible/prod/host_vars/home.himenkov.ru/secondbrain.yml'),
  'utf8',
);
const match = vars.match(/^secondbrain_couchdb_password:\s*["']?([^"'\n]+)["']?\s*$/m);
if (!match) throw new Error('CouchDB password is missing from private inventory.');
if (existsSync(fixture)) throw new Error(`Refusing to overwrite existing fixture: ${fixture}`);

const auth = Buffer.from(`secondbrain:${match[1].trim()}`).toString('base64');
const endpoint = 'https://sync.himenkov.ru:15984/secondbrain';
const headers = { Authorization: `Basic ${auth}` };
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function info() {
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`CouchDB returned HTTP ${response.status}.`);
  return response.json();
}

async function waitForUpdate(previousSequence, label) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(1_000);
    const current = await info();
    if (`${current.update_seq}` !== `${previousSequence}`) return current;
  }
  throw new Error(`Timed out waiting for CouchDB after ${label}.`);
}

const before = await info();
let afterCreate;
try {
  writeFileSync(
    fixture,
    `---\ntype: acceptance-test\ncreated: ${new Date().toISOString()}\n---\n\nLiveSync acceptance fixture.\n`,
    { flag: 'wx', mode: 0o600 },
  );
  afterCreate = await waitForUpdate(before.update_seq, 'fixture creation');
} finally {
  if (existsSync(fixture)) unlinkSync(fixture);
}

const afterDelete = await waitForUpdate(afterCreate.update_seq, 'fixture deletion');
console.log(
  JSON.stringify({
    result: 'pass',
    createObserved: `${before.update_seq}` !== `${afterCreate.update_seq}`,
    deleteObserved: `${afterCreate.update_seq}` !== `${afterDelete.update_seq}`,
    documentsAfterCleanup: afterDelete.doc_count,
    deletedDocumentsAfterCleanup: afterDelete.doc_del_count,
  }),
);
