#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const action = process.argv[2];
const repoRoot = path.resolve(import.meta.dirname, '../..');
const secretsFile = path.join(repoRoot, '.private/secondbrain/client-secrets.env');
const setupUriFile = path.join(repoRoot, '.private/secondbrain/setup-uri.txt');

function parseEnv(filename) {
  return Object.fromEntries(
    readFileSync(filename, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

if (action === 'passphrase') {
  const passphrase = parseEnv(secretsFile).LIVESYNC_SETUP_URI_PASSPHRASE;
  if (!passphrase || passphrase.length < 32) throw new Error('Strong Setup URI passphrase is missing.');
  execFileSync('pbcopy', { input: passphrase, stdio: ['pipe', 'ignore', 'inherit'] });
  console.log('Setup URI passphrase copied to the local clipboard; its value was not printed.');
} else if (action === 'capture-uri') {
  const value = execFileSync('pbpaste', { encoding: 'utf8' }).trim();
  if (!value.startsWith('obsidian://setuplivesync?settings=')) {
    throw new Error('Clipboard does not contain a standard LiveSync Setup URI.');
  }
  writeFileSync(setupUriFile, `${value}\n`, { mode: 0o600 });
  chmodSync(setupUriFile, 0o600);
  console.log('Encrypted Setup URI captured in the private directory; its value was not printed.');
} else if (action === 'clear') {
  execFileSync('pbcopy', { input: '', stdio: ['pipe', 'ignore', 'inherit'] });
  console.log('Clipboard cleared.');
} else {
  throw new Error('Usage: setup-clipboard.mjs passphrase|capture-uri|clear');
}
