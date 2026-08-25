import assert from 'node:assert/strict';
import test from 'node:test';

import { Jarvis } from '../src/jarvis.js';

function privateMessage(text, userId = 42, chatId = 42) {
  return {
    message: {
      chat: { id: chatId, type: 'private' },
      from: { id: userId },
      text,
    },
  };
}

function accessStore() {
  const paired = new Set();
  return {
    isPaired: (userId) => paired.has(userId),
    pair: (userId) => paired.add(userId),
  };
}

test('ignores every account except the configured Telegram user', async () => {
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access: accessStore(),
  });

  assert.deepEqual(await jarvis.handle(privateMessage('/pair PAIR-1234', 99, 99)), []);
  assert.deepEqual(await jarvis.handle({
    message: {
      chat: { id: 42, type: 'group' },
      from: { id: 42 },
      text: '/pair PAIR-1234',
    },
  }), []);
});

test('pairs once, uses the local model, and offers explicit cloud fallback on failure', async () => {
  const access = accessStore();
  let localShouldFail = false;
  let cloudCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: {
      answer: async (prompt) => {
        if (localShouldFail) throw new Error('runtime unavailable');
        return `local:${prompt}`;
      },
    },
    cloudLlm: {
      answer: async (prompt) => {
        cloudCalls += 1;
        return `cloud:${prompt}`;
      },
    },
  });

  assert.match((await jarvis.handle(privateMessage('/pair WRONG')))[0].text, /невер/i);
  assert.match((await jarvis.handle(privateMessage('/pair PAIR-1234')))[0].text, /привяз/i);
  assert.equal((await jarvis.handle(privateMessage('привет')))[0].text, 'local:привет');

  localShouldFail = true;
  const fallback = (await jarvis.handle(privateMessage('сложный вопрос')))[0];
  assert.match(fallback.text, /локальная модель не справилась/i);
  assert.equal(fallback.buttons[0].callbackData, 'cloud_retry');
  assert.equal(cloudCalls, 0, 'cloud must never run automatically');

  assert.equal((await jarvis.handle(privateMessage('/cloud сложный вопрос')))[0].text, 'cloud:сложный вопрос');
  assert.equal(cloudCalls, 1);
});

test('routes capability and qBittorrent inventory questions without asking the LLM', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  let torrentCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'hallucination'; } },
    torrents: {
      list: async () => {
        torrentCalls += 1;
        return [{
          name: 'Ubuntu.iso',
          progress: 0.5,
          size: 2 * 1024 ** 3,
          state: 'downloading',
          hash: 'abcdef1234567890',
        }];
      },
    },
  });

  const capabilities = (await jarvis.handle(privateMessage('Расскажи, что ты умеешь')))[0].text;
  assert.match(capabilities, /qBittorrent/);
  assert.match(capabilities, /Brave/);
  assert.match(capabilities, /\/status/);
  assert.match(capabilities, /\/health/);
  assert.match(capabilities, /\/services/);
  assert.match(capabilities, /\/network/);
  assert.match(capabilities, /\/storage/);

  const inventory = (await jarvis.handle(privateMessage('Что у меня скачано через qBittorrent?')))[0].text;
  assert.match(inventory, /Ubuntu\.iso/);
  assert.match(inventory, /50%/);
  assert.equal(torrentCalls, 1);
  assert.equal(localCalls, 0);
});

test('understands a colloquial downloaded-files inventory question', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'hallucination'; } },
    torrents: {
      list: async () => [{
        name: 'Some.Movie.2026.mkv',
        progress: 1,
        size: 4 * 1024 ** 3,
        state: 'uploading',
        hash: 'feedface12345678',
      }],
    },
  });

  const answer = (await jarvis.handle(
    privateMessage('Чо там по скачанным файлам? Какие фильмы уже есть?'),
  ))[0].text;

  assert.match(answer, /Some\.Movie\.2026\.mkv/);
  assert.equal(localCalls, 0);
});

test('does not confuse a colloquial torrent mutation with an inventory question', async () => {
  const access = accessStore();
  access.pair(42);
  let torrentCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => 'local-action-guidance' },
    torrents: {
      list: async () => {
        torrentCalls += 1;
        return [];
      },
    },
  });

  const answer = (await jarvis.handle(
    privateMessage('Чо, удалить скачанный торрент?'),
  ))[0].text;

  assert.equal(answer, 'local-action-guidance');
  assert.equal(torrentCalls, 0);
});

test('answers a natural RAM question from read-only host diagnostics', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return '256 GiB'; } },
    systemStatus: {
      get: async () => ({
        memory: { totalBytes: 4 * 1024 ** 3, availableBytes: 1.5 * 1024 ** 3 },
        swap: { totalBytes: 2 * 1024 ** 3, freeBytes: 1.25 * 1024 ** 3 },
        disk: { totalBytes: 64 * 1024 ** 3, freeBytes: 40 * 1024 ** 3 },
        temperatureCelsius: 42.5,
        loadAverage: [0.2, 0.3, 0.4],
        uptimeSeconds: 3 * 24 * 60 * 60,
      }),
    },
  });

  const answer = (await jarvis.handle(
    privateMessage('сколько оперативной памяти у тебя свободно?'),
  ))[0].text;

  assert.match(answer, /RAM: 1\.5 GiB свободно из 4\.0 GiB/);
  assert.match(answer, /42\.5 °C/);
  assert.equal(localCalls, 0);
});

test('routes natural temperature and uptime questions to real host diagnostics', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  let statusCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'горячо'; } },
    systemStatus: {
      get: async () => {
        statusCalls += 1;
        return {
          memory: { totalBytes: 4 * 1024 ** 3, availableBytes: 2 * 1024 ** 3 },
          swap: { totalBytes: 2 * 1024 ** 3, freeBytes: 2 * 1024 ** 3 },
          disk: { totalBytes: 64 * 1024 ** 3, freeBytes: 40 * 1024 ** 3 },
          temperatureCelsius: 46.25,
          loadAverage: [0.1, 0.2, 0.3],
          uptimeSeconds: 4 * 24 * 60 * 60,
        };
      },
    },
  });

  assert.match((await jarvis.handle(privateMessage('Сильно коробочка греется?')))[0].text, /46\.3 °C/);
  assert.match((await jarvis.handle(privateMessage('Какой сейчас uptime?')))[0].text, /4\.0 суток/);
  assert.equal(statusCalls, 2);
  assert.equal(localCalls, 0);
});

test('answers a natural free-disk-space question from fixed storage diagnostics', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'много места'; } },
    systemStatus: {
      storage: async () => ({ volumes: [
        { name: 'SSD', mountPoint: '/mnt/ssd', totalBytes: 100 * 1024 ** 3, freeBytes: 60 * 1024 ** 3 },
        { name: 'HDD', mountPoint: '/mnt/hdd', totalBytes: 1000 * 1024 ** 3, freeBytes: 250 * 1024 ** 3 },
      ] }),
    },
  });

  const answer = (await jarvis.handle(
    privateMessage('Сколько свободного места на SSD и HDD?'),
  ))[0].text;

  assert.match(answer, /SSD.*60\.0 GiB свободно из 100\.0 GiB.*60%/);
  assert.match(answer, /HDD.*250\.0 GiB свободно из 1000\.0 GiB.*25%/);
  assert.equal(localCalls, 0);
});

test('answers a natural service-health question from the fixed allowlist', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'наверное всё работает'; } },
    systemStatus: {
      services: async () => ({
        services: [
          { name: 'Samba', state: 'running', health: 'healthy', ok: true },
          { name: 'RemnaNode', state: 'exited', health: null, ok: false },
        ],
        allHealthy: false,
      }),
    },
  });

  const answer = (await jarvis.handle(
    privateMessage('Что там с сервисами, всё работает?'),
  ))[0].text;

  assert.match(answer, /✅ Samba: running \(healthy\)/);
  assert.match(answer, /❌ RemnaNode: exited/);
  assert.match(answer, /есть проблемы/i);
  assert.equal(localCalls, 0);
});

test('answers DNS and VPN questions from network diagnostics without the LLM', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  let vpnChecks = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'DNS от Google'; } },
    vpnGuard: { isAvailable: async () => { vpnChecks += 1; return true; } },
    systemStatus: {
      network: async () => ({
        interface: 'end0',
        ipv4Address: '192.168.1.164',
        gateway: '192.168.1.1',
        dnsServers: ['192.168.1.1', 'fd24:e392:1961::1'],
        dnsUsesRouter: true,
        firewallActive: true,
      }),
    },
  });

  const answer = (await jarvis.handle(
    privateMessage('Какой DNS сейчас используется и Brave идёт через VPN?'),
  ))[0].text;

  assert.match(answer, /IP: 192\.168\.1\.164 \(end0\)/);
  assert.match(answer, /Шлюз: 192\.168\.1\.1/);
  assert.match(answer, /DNS: 192\.168\.1\.1, fd24:e392:1961::1/);
  assert.match(answer, /DNS через роутер: да/);
  assert.match(answer, /Brave через VPN: доступен/);
  assert.equal(vpnChecks, 1);
  assert.equal(localCalls, 0);
});

test('gives a compact real health report for a natural operator question', async () => {
  const access = accessStore();
  access.pair(42);
  let localCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { answer: async () => { localCalls += 1; return 'всё норм'; } },
    vpnGuard: { isAvailable: async () => true },
    systemStatus: {
      get: async () => ({
        memory: { totalBytes: 4 * 1024 ** 3, availableBytes: 1.5 * 1024 ** 3 },
        swap: { totalBytes: 2 * 1024 ** 3, freeBytes: 1.8 * 1024 ** 3 },
        disk: { totalBytes: 64 * 1024 ** 3, freeBytes: 40 * 1024 ** 3 },
        temperatureCelsius: 45,
        loadAverage: [0.2, 0.3, 0.4],
        uptimeSeconds: 172800,
      }),
      storage: async () => ({ volumes: [
        { name: 'SSD', mountPoint: '/mnt/ssd', totalBytes: 100 * 1024 ** 3, freeBytes: 60 * 1024 ** 3 },
        { name: 'HDD', mountPoint: '/mnt/hdd', totalBytes: 1000 * 1024 ** 3, freeBytes: 250 * 1024 ** 3 },
      ] }),
      services: async () => ({
        services: [
          { name: 'Samba', state: 'running', health: 'healthy', ok: true },
          { name: 'RemnaNode', state: 'exited', health: null, ok: false },
        ],
        allHealthy: false,
      }),
      network: async () => ({
        interface: 'end0', ipv4Address: '192.168.1.164', gateway: '192.168.1.1',
        dnsServers: ['192.168.1.1'], dnsUsesRouter: true, firewallActive: true,
      }),
    },
  });

  const answer = (await jarvis.handle(privateMessage('Доложи обстановку')))[0].text;

  assert.match(answer, /⚠️ NanoPi требует внимания/);
  assert.match(answer, /RAM: 1\.5 GiB свободно из 4\.0 GiB/);
  assert.match(answer, /45\.0 °C/);
  assert.match(answer, /Диски: SSD 60%, HDD 25% свободно/);
  assert.match(answer, /Сервисы: 1\/2 работают; проблемы: RemnaNode/);
  assert.match(answer, /Сеть: 192\.168\.1\.164 → 192\.168\.1\.1; DNS через роутер; UFW включён; Brave VPN доступен/);
  assert.equal(localCalls, 0);
});

test('requires confirmation for every mutating action and two confirmations for deleting files', async () => {
  const access = accessStore();
  access.pair(42);
  const executed = [];
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    actions: {
      execute: async (action) => executed.push(action),
    },
  });

  const restart = (await jarvis.handle(privateMessage('/restart samba')))[0];
  assert.match(restart.text, /подтверд/i);
  assert.equal(executed.length, 0);

  await jarvis.handle({ callback_query: {
    id: 'cb-1',
    from: { id: 42 },
    message: { chat: { id: 42, type: 'private' } },
    data: restart.buttons[0].callbackData,
  } });
  assert.deepEqual(executed, [{ type: 'restart', service: 'samba' }]);

  const removal = (await jarvis.handle(privateMessage('/torrent delete-files abc123')))[0];
  const first = await jarvis.handle({ callback_query: {
    id: 'cb-2',
    from: { id: 42 },
    message: { chat: { id: 42, type: 'private' } },
    data: removal.buttons[0].callbackData,
  } });
  assert.match(first[0].text, /повтор/i);
  assert.equal(executed.length, 1);
});

test('exposes privacy and clears only conversation history', async () => {
  const access = accessStore();
  access.pair(42);
  let cleared = false;
  let runtimeCleared = false;
  access.privacy = () => ({ historyMessages: 12, historyTtlDays: 7, historyMaxMessages: 30 });
  access.clear = () => { cleared = true; };
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    localLlm: { clear: async () => { runtimeCleared = true; } },
  });

  const privacy = (await jarvis.handle(privateMessage('/privacy')))[0].text;
  assert.match(privacy, /12/);
  assert.match(privacy, /7/);
  assert.match(privacy, /30/);

  assert.match((await jarvis.handle(privateMessage('/clear')))[0].text, /очищ/i);
  assert.equal(cleared, true);
  assert.equal(runtimeCleared, true);
});

test('runs internet research only for an explicit search command and includes citations', async () => {
  const access = accessStore();
  access.pair(42);
  let searchCalls = 0;
  const jarvis = new Jarvis({
    allowedUserId: 42,
    pairingSecret: 'PAIR-1234',
    access,
    webResearch: {
      answer: async (query) => {
        searchCalls += 1;
        assert.equal(query, 'RKLLM 1.3');
        return {
          text: 'Найден официальный runtime.',
          citations: [{ title: 'Rockchip', url: 'https://github.com/airockchip/rknn-llm' }],
        };
      },
    },
  });

  const response = (await jarvis.handle(privateMessage('/search RKLLM 1.3')))[0].text;
  assert.match(response, /Найден официальный runtime/);
  assert.match(response, /https:\/\/github\.com\/airockchip\/rknn-llm/);
  assert.equal(searchCalls, 1);
});
