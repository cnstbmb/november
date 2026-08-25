import assert from 'node:assert/strict';
import test from 'node:test';

import { WebResearch } from '../src/web-research.js';

test('fails closed when the router VPN path is unavailable', async () => {
  let braveCalls = 0;
  const research = new WebResearch({
    apiKey: 'test-key',
    vpnGuard: { isAvailable: async () => false },
    limiter: { consume: () => true },
    fetch: async () => {
      braveCalls += 1;
      throw new Error('must not be called');
    },
  });

  const result = await research.answer('новости NPU');
  assert.equal(result.text, 'интернет-поиск временно недоступен');
  assert.equal(braveCalls, 0);
});

test('uses only the fixed Brave endpoint, enforces the daily limit, and returns safe citations', async () => {
  const calls = [];
  let remaining = 1;
  const research = new WebResearch({
    apiKey: 'test-key',
    vpnGuard: { isAvailable: async () => true },
    limiter: { consume: () => remaining-- > 0 },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: '<strong>Rockchip</strong> docs',
              url: 'https://github.com/airockchip/rknn-llm',
              description: '<strong>Official</strong> runtime &amp; safe.',
            },
            { title: 'Unsafe', url: 'http://127.0.0.1/admin', description: 'Must be dropped.' },
          ],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await research.answer('RKLLM');
  assert.match(calls[0].url, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?/);
  assert.equal(calls[0].options.headers['X-Subscription-Token'], 'test-key');
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].url, 'https://github.com/airockchip/rknn-llm');
  assert.equal(result.citations[0].title, 'Rockchip docs');
  assert.equal(result.citations[0].description, 'Official runtime & safe.');

  await assert.rejects(() => research.answer('second request'), /лимит/i);
});
