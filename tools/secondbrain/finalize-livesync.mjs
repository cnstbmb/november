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
if (!settings.isConfigured || !settings.activeConfigurationId) {
  throw new Error('LiveSync remote configuration has not completed its migration.');
}
if (settings.versionUpFlash) {
  throw new Error('LiveSync compatibility/change-log acknowledgement is still pending.');
}

Object.assign(settings, {
  // Match LiveSync's built-in continuous-sync preset. Other sync triggers stay
  // disabled so the same edit is not queued through several mechanisms.
  liveSync: true,
  periodicReplication: false,
  syncOnSave: false,
  syncOnEditorSave: false,
  syncOnStart: false,
  syncOnFileOpen: false,
  syncAfterMerge: false,
  batchSave: false,
  keepReplicationActiveInBackground: true,
  suspendFileWatching: false,
  suspendParseReplicationResult: false,
  customChunkSize: 60,
  usePluginSyncV2: true,
  writeLogToTheFile: false,
  showVerboseLog: false,
  lessInformationInLog: true,
});

writeFileSync(filename, `${JSON.stringify(settings, null, 2)}\n`, {
  mode: statSync(filename).mode,
});
console.log('Enabled the LiveSync continuous-sync preset on the migrated remote profile.');
