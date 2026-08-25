import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ActionBrokerClient } from '../src/action-broker-client.js';
import { DeepSeekLlm, LocalLlm } from '../src/llm.js';
import { ActionExecutor } from '../src/action-executor.js';
import { QbittorrentClient } from '../src/qbittorrent.js';
import { VpnGuard } from '../src/vpn-guard.js';

test('reads authenticated host diagnostics from the action broker Unix socket', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-broker-'));
  const socketPath = path.join(directory, 'broker.sock');
  const expected = {
    memory: { totalBytes: 4_000_000_000, availableBytes: 1_500_000_000 },
    swap: { totalBytes: 2_000_000_000, freeBytes: 1_800_000_000 },
    disk: { totalBytes: 64_000_000_000, freeBytes: 40_000_000_000 },
    temperatureCelsius: 44.5,
    loadAverage: [0.1, 0.2, 0.3],
    uptimeSeconds: 172800,
  };
  const expectedStorage = { volumes: [{
    name: 'SSD', mountPoint: '/mnt/ssd', totalBytes: 1000, freeBytes: 600,
  }] };
  const expectedServices = {
    services: [{ name: 'Docker', kind: 'systemd', state: 'active', health: null, ok: true }],
    allHealthy: true,
  };
  const expectedNetwork = {
    interface: 'end0',
    ipv4Address: '192.168.1.164',
    gateway: '192.168.1.1',
    dnsServers: ['192.168.1.1'],
    dnsUsesRouter: true,
    firewallActive: true,
  };
  const server = http.createServer((request, response) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer status-test-token');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url === '/v1/status') response.end(JSON.stringify(expected));
    else if (request.url === '/v1/storage') response.end(JSON.stringify(expectedStorage));
    else if (request.url === '/v1/services') response.end(JSON.stringify(expectedServices));
    else if (request.url === '/v1/network') response.end(JSON.stringify(expectedNetwork));
    else response.end(JSON.stringify({ ok: false }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });

  try {
    const client = new ActionBrokerClient({ socketPath, token: 'status-test-token' });
    assert.deepEqual(await client.get(), expected);
    assert.deepEqual(await client.storage(), expectedStorage);
    assert.deepEqual(await client.services(), expectedServices);
    assert.deepEqual(await client.network(), expectedNetwork);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('sends bounded combined context to the fixed local RKLLM endpoint and stores both turns', async () => {
  const added = [];
  const store = {
    getContext: () => [{ role: 'user', content: 'старый вопрос' }, { role: 'assistant', content: 'старый ответ' }],
    addMessage: (...args) => added.push(args),
  };
  const calls = [];
  const llm = new LocalLlm({
    baseUrl: 'http://rkllm:8080/v1',
    model: 'qwen3-0.6b-w4a16-rk3576',
    maxTokens: 512,
    timeoutMs: 45_000,
    store,
    userId: 42,
    fetch: async (url, options) => {
      calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'локальный ответ' } }] }), { status: 200 });
    },
  });

  assert.equal(await llm.answer('новый вопрос'), 'локальный ответ');
  assert.equal(calls[0].url, 'http://rkllm:8080/v1/clear-kv-cache');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].url, 'http://rkllm:8080/v1/chat/completions');
  assert.equal(calls[1].body.max_tokens, 512);
  assert.equal(calls[1].body.enable_thinking, false);
  assert.equal(calls[1].body.messages.length, 1, 'official RKLLM server consumes one combined prompt');
  assert.match(calls[1].body.messages[0].content, /старый вопрос/);
  assert.match(calls[1].body.messages[0].content, /новый вопрос/);
  assert.deepEqual(added.map((item) => item.slice(1, 3)), [
    ['user', 'новый вопрос'],
    ['assistant', 'локальный ответ'],
  ]);
});

test('DeepSeek is fixed to its API, capped at 1500 tokens, and consumes the explicit daily quota', async () => {
  let allowed = false;
  let fetchCalls = 0;
  const llm = new DeepSeekLlm({
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'deepseek-test',
    dailyLimit: 100,
    maxTokens: 1500,
    limiter: { consume: (kind, limit) => kind === 'deepseek' && limit === 100 && allowed },
    fetch: async (url, options) => {
      fetchCalls += 1;
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      assert.equal(JSON.parse(options.body).max_tokens, 1500);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'cloud answer' } }] }), { status: 200 });
    },
  });

  await assert.rejects(() => llm.answer('question'), /лимит/i);
  assert.equal(fetchCalls, 0);
  allowed = true;
  assert.equal(await llm.answer('question'), 'cloud answer');
  assert.equal(fetchCalls, 1);
});

test('checks the exact Moscow VPN selector against the Brave API URL', async () => {
  const calls = [];
  const guard = new VpnGuard({
    routerApiUrl: 'http://192.168.1.1:9090',
    selector: 'Moscow',
    probeUrl: 'https://api.search.brave.com',
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ delay: 507 }), { status: 200 });
    },
  });

  assert.equal(await guard.isAvailable(), true);
  assert.match(calls[0].url, /\/proxies\/Moscow\/delay\?/);
  assert.match(calls[0].url, /url=https%3A%2F%2Fapi\.search\.brave\.com/);
  assert.equal(calls[0].options.redirect, 'error');
});

test('dispatches restart only to the broker and torrent actions only to qBittorrent', async () => {
  const brokerActions = [];
  const torrentActions = [];
  const executor = new ActionExecutor({
    broker: { restart: async (service) => brokerActions.push(service) },
    qbittorrent: { execute: async (action) => torrentActions.push(action) },
    audit: { audit: () => {} },
  });

  await executor.execute({ type: 'restart', service: 'samba' });
  await executor.execute({ type: 'torrent.pause', hash: 'abc123' });
  assert.deepEqual(brokerActions, ['samba']);
  assert.deepEqual(torrentActions, [{ type: 'torrent.pause', hash: 'abc123' }]);
});

test('maps approved torrent operations to qBittorrent Web API without URL interpolation', async () => {
  const calls = [];
  const client = new QbittorrentClient({
    baseUrl: 'http://host.docker.internal:8080',
    username: 'user',
    password: 'pass',
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', { status: 200, headers: { 'set-cookie': 'SID=test-session; HttpOnly' } });
      }
      return new Response('Ok.', { status: 200 });
    },
  });

  await client.execute({ type: 'torrent.delete', hash: 'abc123', deleteFiles: true });
  const action = calls.at(-1);
  assert.equal(action.url, 'http://host.docker.internal:8080/api/v2/torrents/delete');
  assert.equal(action.options.body.get('hashes'), 'abc123');
  assert.equal(action.options.body.get('deleteFiles'), 'true');
  assert.match(action.options.headers.Cookie, /^SID=/);
});

test('accepts qBittorrent 5.2 login with HTTP 204 and a session cookie', async () => {
  const client = new QbittorrentClient({
    baseUrl: 'http://host.docker.internal:8080',
    username: 'user',
    password: 'pass',
    fetch: async (url) => {
      if (String(url).endsWith('/api/v2/auth/login')) {
        return new Response(null, {
          status: 204,
          headers: { 'set-cookie': 'SID=qbit-5-session; HttpOnly' },
        });
      }
      if (String(url).endsWith('/api/v2/torrents/info')) {
        return Response.json([{ name: 'Movie.mkv', progress: 1 }]);
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  assert.deepEqual(await client.list(), [{ name: 'Movie.mkv', progress: 1 }]);
});
