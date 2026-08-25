import assert from 'node:assert/strict';
import test from 'node:test';

import { TelegramClient } from '../src/telegram.js';

test('long-polls only messages/callbacks and renders inline confirmation buttons', async () => {
  const calls = [];
  const client = new TelegramClient({
    token: 'telegram-test-token',
    handler: async () => [{
      text: 'Подтверди действие',
      buttons: [{ text: 'Подтвердить', callbackData: 'confirm:opaque' }],
    }],
    fetch: async (url, options) => {
      const method = String(url).split('/').at(-1);
      const body = JSON.parse(options.body);
      calls.push({ method, body });
      if (method === 'getUpdates') {
        return new Response(JSON.stringify({
          ok: true,
          result: [{
            update_id: 10,
            message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '/restart samba' },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    },
  });

  await client.pollOnce();
  assert.deepEqual(calls[0].body.allowed_updates, ['message', 'callback_query']);
  const sent = calls.find((call) => call.method === 'sendMessage');
  assert.equal(sent.body.chat_id, 42);
  assert.equal(sent.body.reply_markup.inline_keyboard[0][0].callback_data, 'confirm:opaque');
  assert.equal(client.offset, 11);
});

test('acknowledges callback queries even when the handler returns no message', async () => {
  const methods = [];
  const client = new TelegramClient({
    token: 'telegram-test-token',
    handler: async () => [],
    fetch: async (url) => {
      const method = String(url).split('/').at(-1);
      methods.push(method);
      if (method === 'getUpdates') {
        return new Response(JSON.stringify({
          ok: true,
          result: [{
            update_id: 20,
            callback_query: {
              id: 'callback-id',
              from: { id: 42 },
              message: { chat: { id: 42, type: 'private' } },
              data: 'noop',
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    },
  });

  await client.pollOnce();
  assert.equal(methods.includes('answerCallbackQuery'), true);
});
