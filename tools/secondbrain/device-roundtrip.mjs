#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [action, rawDevice = 'device'] = process.argv.slice(2);
const device = rawDevice.replace(/[^a-z0-9-]/gi, '').toLowerCase();
if (!device) throw new Error('A safe device name is required.');

const repoRoot = path.resolve(import.meta.dirname, '../..');
const vault = '/Users/konstantin/Obsidian/SecondBrain';
const displayName = device === 'iphone' ? 'iPhone' : device;
const fixture = path.join(vault, '00 Inbox', `LiveSync Device Check - ${displayName}.md`);
const stateFile = path.join(repoRoot, '.tmp', `livesync-device-check-${device}.json`);
const hash = (value) => createHash('sha256').update(value).digest('hex');

if (action === 'start') {
  if (existsSync(fixture) || existsSync(stateFile)) {
    throw new Error('A round-trip test for this device is already active.');
  }
  const content = `---\ntype: acceptance-test\ndevice: ${device}\ncreated: ${new Date().toISOString()}\n---\n\nОткрой эту заметку на ${displayName} и добавь отдельной строкой:\n\n${device} ok\n`;
  writeFileSync(fixture, content, { flag: 'wx', mode: 0o600 });
  writeFileSync(
    stateFile,
    `${JSON.stringify({ device, fixture, initialHash: hash(content) }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(`Round-trip fixture created: 00 Inbox/${path.basename(fixture)}`);
} else if (action === 'check') {
  if (!existsSync(fixture) || !existsSync(stateFile)) throw new Error('Round-trip fixture is missing.');
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const content = readFileSync(fixture, 'utf8');
  if (hash(content) === state.initialHash) throw new Error('The fixture has not returned with a device edit yet.');
  if (!new RegExp(`^${device} ok\\s*$`, 'im').test(content)) {
    throw new Error(`The returned edit does not contain "${device} ok".`);
  }
  console.log(`Round-trip edit from ${displayName} observed locally.`);
} else if (action === 'cleanup') {
  if (existsSync(fixture)) unlinkSync(fixture);
  if (existsSync(stateFile)) unlinkSync(stateFile);
  console.log(`Round-trip fixture for ${displayName} removed.`);
} else {
  throw new Error('Usage: device-roundtrip.mjs start|check|cleanup <device>');
}
