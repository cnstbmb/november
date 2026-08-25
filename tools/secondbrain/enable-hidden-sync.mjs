#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const filename =
  process.argv[2] ??
  '/Users/konstantin/Obsidian/SecondBrain/.obsidian/plugins/obsidian-livesync/data.json';

if (process.platform === 'darwin') {
  try {
    const processes = execFileSync('pgrep', ['-fal', '/Applications/Obsidian.app'], {
      encoding: 'utf8',
    }).trim();
    if (processes) throw new Error(`Obsidian is running:\n${processes}`);
  } catch (error) {
    if (error.status === 0 || error.message.startsWith('Obsidian is running:')) throw error;
  }
}

const settings = JSON.parse(readFileSync(filename, 'utf8'));
if (!settings.isConfigured || !settings.activeConfigurationId || !settings.liveSync) {
  throw new Error('Ordinary continuous LiveSync must be configured first.');
}

const targetPatterns =
  '^\\.obsidian(?:$|/(?:app\\.json|appearance\\.json|backlink\\.json|community-plugins\\.json|core-plugins\\.json|daily-notes\\.json|graph\\.json|hotkeys\\.json|types\\.json|plugins(?:$|/(?:(?:dataview|obsidian-charts|obsidian-linter|obsidian-tasks-plugin|quickadd|symbol-linking|tag-wrangler|templater-obsidian)(?:/|$)|llm-hub(?:$|/(?:main\\.js|manifest\\.json|styles\\.css)$)))))';
const target = new RegExp(targetPatterns);
for (const expected of [
  '.obsidian/app.json',
  '.obsidian/hotkeys.json',
  '.obsidian/plugins/quickadd/data.json',
  '.obsidian/plugins/llm-hub',
  '.obsidian/plugins/llm-hub/main.js',
  '.obsidian/plugins/llm-hub/manifest.json',
  '.obsidian/plugins/llm-hub/styles.css',
]) {
  if (!target.test(expected)) throw new Error(`Allowlist does not include ${expected}.`);
}
for (const denied of [
  '.obsidian/workspace.json',
  '.obsidian/workspace-mobile.json',
  '.obsidian/plugins/obsidian-livesync/data.json',
  '.obsidian/plugins/obsidian-git/data.json',
  '.obsidian/plugins/llm-hub/data.json',
  '.obsidian/plugins/llm-hub/credentials.json',
  '.LLMHub/rag/index.json',
]) {
  if (target.test(denied)) throw new Error(`Allowlist unexpectedly includes ${denied}.`);
}

Object.assign(settings, {
  syncInternalFiles: true,
  syncInternalFilesBeforeReplication: true,
  syncInternalFilesInterval: 60,
  watchInternalFileChanges: true,
  syncInternalFilesTargetPatterns: targetPatterns,
  syncInternalFilesIgnorePatterns:
    '\\/node_modules\\/, \\/\\.git\\/, ^\\.git\\/, \\/obsidian-livesync\\/, \\/workspace\\.json$/, \\/workspace-mobile\\.json$',
  syncInternalFileOverwritePatterns: '',
  usePluginSync: false,
  // V2 is the preferred document format even when Customisation Sync itself
  // remains disabled. It must match the remote tweak record.
  usePluginSyncV2: true,
  usePluginSettings: false,
  writeCredentialsForSettingSync: false,
});

writeFileSync(filename, `${JSON.stringify(settings, null, 2)}\n`, {
  mode: statSync(filename).mode,
});
console.log('Enabled narrow Hidden File Sync; workspace, credentials, AI caches and Git remain excluded.');
