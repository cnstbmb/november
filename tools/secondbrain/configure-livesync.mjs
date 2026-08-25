#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const vault = path.resolve(option('--vault', '/Users/konstantin/Obsidian/SecondBrain'));
const deviceName = option('--device-name', 'personal-mac');
const repoRoot = path.resolve(import.meta.dirname, '../..');
const liveSyncFile = path.join(vault, '.obsidian/plugins/obsidian-livesync/data.json');
const pluginsFile = path.join(vault, '.obsidian/community-plugins.json');
const clientSecretsFile = path.join(repoRoot, '.private/secondbrain/client-secrets.env');
const serverSecretsFile = path.join(
  repoRoot,
  '.private/ansible/prod/host_vars/home.himenkov.ru/secondbrain.yml',
);

for (const filename of [liveSyncFile, pluginsFile, clientSecretsFile, serverSecretsFile]) {
  if (!existsSync(filename)) throw new Error(`Required file is missing: ${filename}`);
}

if (apply && process.platform === 'darwin') {
  try {
    const processes = execFileSync('pgrep', ['-fal', '/Applications/Obsidian.app'], { encoding: 'utf8' }).trim();
    if (processes) throw new Error(`Obsidian is running:\n${processes}`);
  } catch (error) {
    if (error.status === 0 || error.message.startsWith('Obsidian is running:')) throw error;
  }
}

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

function parseYamlScalar(filename, key) {
  const expression = new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm');
  const match = readFileSync(filename, 'utf8').match(expression);
  if (!match) throw new Error(`Missing ${key} in private server variables.`);
  return match[1].trim();
}

const clientSecrets = parseEnv(clientSecretsFile);
const couchPassword = parseYamlScalar(serverSecretsFile, 'secondbrain_couchdb_password');
const e2eePassphrase = clientSecrets.LIVESYNC_E2EE_PASSPHRASE;
if (!e2eePassphrase || couchPassword.length < 32 || e2eePassphrase.length < 32) {
  throw new Error('Strong CouchDB and E2EE credentials are required.');
}

const endpoint = 'https://sync.himenkov.ru:15984';
const username = 'secondbrain';
const database = 'secondbrain';

const response = await fetch(`${endpoint}/${database}`, {
  headers: { Authorization: `Basic ${Buffer.from(`${username}:${couchPassword}`).toString('base64')}` },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Authenticated CouchDB check failed with HTTP ${response.status}.`);

const settings = JSON.parse(readFileSync(liveSyncFile, 'utf8'));
Object.assign(settings, {
  remoteType: 'CouchDB',
  couchDB_URI: endpoint,
  couchDB_USER: username,
  couchDB_PASSWORD: couchPassword,
  couchDB_DBNAME: database,
  encrypt: true,
  passphrase: e2eePassphrase,
  E2EEAlgorithm: 'v2',
  usePathObfuscation: true,
  liveSync: true,
  syncOnStart: true,
  syncOnFileOpen: true,
  syncAfterMerge: true,
  syncOnSave: false,
  syncOnEditorSave: false,
  periodicReplication: false,
  keepReplicationActiveInBackground: true,
  trashInsteadDelete: true,
  useHistory: true,
  skipOlderFilesOnSync: true,
  useAdvancedMode: true,
  isConfigured: true,
  deviceAndVaultName: deviceName,
  syncInternalFiles: false,
  syncInternalFilesBeforeReplication: true,
  syncInternalFilesInterval: 60,
  watchInternalFileChanges: true,
  syncInternalFilesTargetPatterns:
    '^\\.obsidian(?:$|/(?:app\\.json|appearance\\.json|backlink\\.json|community-plugins\\.json|core-plugins\\.json|daily-notes\\.json|graph\\.json|hotkeys\\.json|types\\.json|plugins(?:$|/(?:(?:dataview|obsidian-charts|obsidian-linter|obsidian-tasks-plugin|quickadd|symbol-linking|tag-wrangler|templater-obsidian)(?:/|$)|llm-hub(?:$|/(?:main\\.js|manifest\\.json|styles\\.css)$)))))',
  syncInternalFilesIgnorePatterns:
    '\\/node_modules\\/, \\/\\.git\\/, ^\\.git\\/, \\/obsidian-livesync\\/, \\/workspace$ ,\\/workspace.json$,\\/workspace-mobile.json$',
  syncInternalFileOverwritePatterns: '',
  usePluginSync: false,
  usePluginSyncV2: false,
  writeCredentialsForSettingSync: false,
  showStatusOnStatusbar: true,
  showStatusOnEditor: true,
  syncMaxSizeInMB: 50,
});

const plugins = JSON.parse(readFileSync(pluginsFile, 'utf8'));
if (!plugins.includes('obsidian-livesync')) plugins.push('obsidian-livesync');

console.log('Authenticated CouchDB check passed.');
console.log(`LiveSync profile: ${deviceName}, E2EE v2, path obfuscation, hidden sync initially disabled.`);
console.log('Sensitive values are redacted from this output.');

if (apply) {
  writeFileSync(liveSyncFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: statSync(liveSyncFile).mode });
  writeFileSync(pluginsFile, `${JSON.stringify(plugins, null, 2)}\n`, { mode: statSync(pluginsFile).mode });
  writeFileSync(path.join(vault, 'flag_rebuild.md'), '', { mode: 0o600 });
  console.log('Applied LiveSync profile and scheduled local-authoritative rebuild on next Obsidian start.');
} else {
  console.log('Dry run only. Use --apply to write settings and the one-shot rebuild flag.');
}
