#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const filename = process.argv[2] ?? '/Users/konstantin/Obsidian/SecondBrain/.obsidian/plugins/obsidian-livesync/data.json';
if (process.platform === 'darwin') {
  try {
    const processes = execFileSync('pgrep', ['-fal', '/Applications/Obsidian.app'], { encoding: 'utf8' }).trim();
    if (processes) throw new Error(`Obsidian is running:\n${processes}`);
  } catch (error) {
    if (error.status === 0 || error.message.startsWith('Obsidian is running:')) throw error;
  }
}

const settings = JSON.parse(readFileSync(filename, 'utf8'));
Object.assign(settings, {
  writeLogToTheFile: true,
  showVerboseLog: true,
  lessInformationInLog: false,
  suspendFileWatching: false,
  suspendParseReplicationResult: false,
});
writeFileSync(filename, `${JSON.stringify(settings, null, 2)}\n`, { mode: statSync(filename).mode });
console.log('Prepared a verbose, unsuspended LiveSync rebuild retry.');
