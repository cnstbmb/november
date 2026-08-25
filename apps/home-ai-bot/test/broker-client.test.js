import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ActionBrokerClient } from '../src/action-broker-client.js';

test('sends an authenticated high-level restart over the dedicated Unix socket', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-broker-'));
  const socketPath = path.join(directory, 'broker.sock');
  const received = {};
  const server = http.createServer((request, response) => {
    received.authorization = request.headers.authorization;
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received.body = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));

  const client = new ActionBrokerClient({ socketPath, token: 'broker-secret' });
  await client.restart('samba');
  assert.equal(received.authorization, 'Bearer broker-secret');
  assert.deepEqual(received.body, { service: 'samba' });

  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(directory, { recursive: true });
});
