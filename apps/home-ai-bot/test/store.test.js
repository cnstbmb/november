import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PersistentStore } from '../src/store.js';

test('keeps at most 30 messages and expires history after seven days', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-store-'));
  const store = new PersistentStore(path.join(directory, 'jarvis.sqlite'), {
    historyTtlDays: 7,
    historyMaxMessages: 30,
    auditTtlDays: 30,
  });
  const now = new Date('2026-08-17T12:00:00Z');

  store.addMessage(42, 'user', 'expired', new Date('2026-08-01T12:00:00Z'));
  for (let index = 0; index < 35; index += 1) {
    store.addMessage(42, index % 2 ? 'assistant' : 'user', `message-${index}`, now);
  }

  const context = store.getContext(42, now);
  assert.equal(context.length, 30);
  assert.equal(context[0].content, 'message-5');
  assert.equal(context.at(-1).content, 'message-34');
  assert.equal(context.some((item) => item.content === 'expired'), false);

  store.close();
  fs.rmSync(directory, { recursive: true });
});

test('persists pairing, atomically enforces daily limits, and supports privacy/clear', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-store-'));
  const filename = path.join(directory, 'jarvis.sqlite');
  const store = new PersistentStore(filename, {
    historyTtlDays: 7,
    historyMaxMessages: 30,
    auditTtlDays: 30,
  });

  assert.equal(store.isPaired(42), false);
  store.pair(42);
  assert.equal(store.isPaired(42), true);

  assert.equal(store.consume('brave', 2, new Date('2026-08-17T01:00:00Z')), true);
  assert.equal(store.consume('brave', 2, new Date('2026-08-17T02:00:00Z')), true);
  assert.equal(store.consume('brave', 2, new Date('2026-08-17T03:00:00Z')), false);
  assert.equal(store.consume('brave', 2, new Date('2026-08-18T01:00:00Z')), true);

  store.addMessage(42, 'user', 'private text');
  store.audit('pairing', { userId: 42 });
  const privacy = store.privacy(42);
  assert.equal(privacy.historyMessages, 1);
  assert.equal(privacy.historyTtlDays, 7);
  store.clear(42);
  assert.equal(store.privacy(42).historyMessages, 0);
  store.close();

  const reopened = new PersistentStore(filename);
  assert.equal(reopened.isPaired(42), true);
  reopened.close();
  fs.rmSync(directory, { recursive: true });
});
