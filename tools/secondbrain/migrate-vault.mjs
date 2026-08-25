#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const vaultFlag = args.indexOf('--vault');
const vault = path.resolve(vaultFlag >= 0 ? args[vaultFlag + 1] : '/Users/konstantin/Obsidian/SecondBrain');

if (!existsSync(path.join(vault, '.obsidian'))) {
  throw new Error(`Not an Obsidian Vault: ${vault}`);
}

if (apply && process.platform === 'darwin') {
  try {
    const processes = execFileSync('pgrep', ['-fal', '/Applications/Obsidian.app'], { encoding: 'utf8' }).trim();
    if (processes) throw new Error(`Obsidian is running:\n${processes}`);
  } catch (error) {
    if (error.status === 0 || error.message.startsWith('Obsidian is running:')) throw error;
  }
}

const operations = [];

function absolute(relative) {
  return path.join(vault, relative);
}

function ensureParent(relative) {
  if (apply) mkdirSync(path.dirname(absolute(relative)), { recursive: true });
}

function move(from, to) {
  const source = absolute(from);
  const destination = absolute(to);
  if (!existsSync(source)) return;
  if (existsSync(destination)) throw new Error(`Destination already exists: ${to}`);
  operations.push(`MOVE ${from} -> ${to}`);
  if (!apply) return;
  ensureParent(to);
  renameSync(source, destination);
}

function updateJson(relative, mutate) {
  const filename = absolute(relative);
  if (!existsSync(filename)) return;
  const before = readFileSync(filename, 'utf8');
  const value = JSON.parse(before);
  mutate(value);
  const after = `${JSON.stringify(value, null, 2)}\n`;
  if (after === before) return;
  operations.push(`UPDATE ${relative}`);
  if (apply) writeFileSync(filename, after, { mode: statSync(filename).mode });
}

function walk(relative, predicate = () => true) {
  const root = absolute(relative);
  if (!existsSync(root)) return [];
  const result = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && predicate(filename)) result.push(filename);
    }
  };
  visit(root);
  return result;
}

function replaceInTree(relative, replacements) {
  for (const filename of walk(relative, (item) => item.endsWith('.md'))) {
    const before = readFileSync(filename, 'utf8');
    const after = replacements.reduce((text, [from, to]) => text.split(from).join(to), before);
    if (after === before) continue;
    operations.push(`UPDATE ${path.relative(vault, filename)}`);
    if (apply) writeFileSync(filename, after, { mode: statSync(filename).mode });
  }
}

function removeEmptyTree(relative) {
  const directory = absolute(relative);
  if (!existsSync(directory)) return;
  const entries = readdirSync(directory);
  if (entries.length === 1 && entries[0] === '.DS_Store') {
    operations.push(`REMOVE JUNK ${relative}/.DS_Store`);
    if (apply) rmSync(path.join(directory, '.DS_Store'));
  }
  if (apply && readdirSync(directory).length === 0) rmdirSync(directory);
}

move('PET/TONEM.RU.md', '20 Projects/Personal/Tonem/TONEM.RU.md');
move('PET/TODO.md', '20 Projects/Personal/Tonem/TODO.md');
move('PET/.obsidian', '90 Archive/Imports/Legacy Vault Config/PET/.obsidian');

for (const person of ['Philipp.md', 'hello world.md']) {
  move(`PEOPLE/${person}`, `50 People/${person}`);
}

move('WORK/OKR', '30 Areas/Work/OKR');
move('WORK/TODO.md', '30 Areas/Work/TODO.md');
move('WORK/121.md', '30 Areas/Work/Management/1-on-1/Подготовка к ревью.md');
move(
  'WORK/Pasted image 20260703150942.png',
  '30 Areas/Work/Management/1-on-1/Pasted image 20260703150942.png',
);
move('WORK/SPRINT/Шаблоны', '99 System/Templates/Work');
move('WORK/SPRINT', '90 Archive/Work/Sprints');
move('WORK/.obsidian', '90 Archive/Imports/Legacy Vault Config/WORK/.obsidian');

move('money/invest', '30 Areas/Finance/Investments');
move('deepseek/deepseek-conversations', '90 Archive/AI Chats/DeepSeek');
move('copilot/copilot-custom-prompts', '99 System/Prompts/Copilot Legacy');
move('Untitled.md', '00 Inbox/Legacy/Untitled.md');
move('Untitled.base', '00 Inbox/Legacy/Untitled.base');

replaceInTree('90 Archive/Work/Sprints', [
  ['WORK/SPRINT/', '90 Archive/Work/Sprints/'],
]);

updateJson('.obsidian/plugins/templater-obsidian/data.json', (settings) => {
  settings.templates_folder = '99 System/Templates';
  for (const pair of settings.folder_templates ?? []) {
    if (pair.folder === 'WORK/SPRINT/Шаблоны') pair.folder = '99 System/Templates/Work';
    if (typeof pair.template === 'string') {
      pair.template = pair.template.replace('WORK/SPRINT/Шаблоны/', '99 System/Templates/Work/');
    }
  }
});

updateJson('.obsidian/plugins/llm-hub/data.json', (settings) => {
  for (const source of settings.knowledgeSources ?? []) {
    if (source.path === 'Knowledge') source.path = '40 Knowledge';
  }
});

updateJson('.obsidian/graph.json', (settings) => {
  settings.showTags = true;
});

for (const directory of ['PET', 'PEOPLE', 'WORK', 'money', 'deepseek', 'copilot']) {
  removeEmptyTree(directory);
}

console.log(`${apply ? 'Applied' : 'Planned'} ${operations.length} operation(s).`);
for (const operation of operations) console.log(operation);
