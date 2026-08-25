const MAX_MESSAGE_LENGTH = 4000;

function chunks(text) {
  const value = String(text);
  const result = [];
  for (let offset = 0; offset < value.length; offset += MAX_MESSAGE_LENGTH) {
    result.push(value.slice(offset, offset + MAX_MESSAGE_LENGTH));
  }
  return result.length > 0 ? result : [''];
}

export class TelegramClient {
  constructor({ token, handler, fetch: fetchImpl = globalThis.fetch }) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.handler = handler;
    this.fetch = fetchImpl;
    this.offset = 0;
    this.stopped = false;
  }

  async #api(method, payload, timeoutMs = 40_000) {
    const response = await this.fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Telegram API ${method} returned HTTP ${response.status}.`);
    const result = await response.json();
    if (!result.ok) throw new Error(`Telegram API ${method} rejected the request.`);
    return result.result;
  }

  async pollOnce() {
    const updates = await this.#api('getUpdates', {
      offset: this.offset,
      timeout: 30,
      allowed_updates: ['message', 'callback_query'],
    }, 35_000);

    for (const update of updates) {
      this.offset = Math.max(this.offset, Number(update.update_id) + 1);
      if (update.callback_query?.id) {
        await this.#api('answerCallbackQuery', { callback_query_id: update.callback_query.id }, 10_000);
      }
      const replies = await this.handler(update);
      const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
      if (!chatId) continue;
      for (const item of replies) {
        const parts = chunks(item.text);
        for (let index = 0; index < parts.length; index += 1) {
          const payload = { chat_id: chatId, text: parts[index], disable_web_page_preview: true };
          if (index === parts.length - 1 && item.buttons?.length) {
            payload.reply_markup = {
              inline_keyboard: [item.buttons.map((button) => ({
                text: button.text,
                callback_data: button.callbackData,
              }))],
            };
          }
          await this.#api('sendMessage', payload, 15_000);
        }
      }
    }
  }

  async run() {
    let retryMs = 1_000;
    while (!this.stopped) {
      try {
        await this.pollOnce();
        retryMs = 1_000;
      } catch (error) {
        console.error(`Telegram polling error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        retryMs = Math.min(retryMs * 2, 30_000);
      }
    }
  }

  stop() {
    this.stopped = true;
  }
}
