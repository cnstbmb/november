function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}${path}`;
}

async function postJson({ fetchImpl, url, body, headers = {}, timeoutMs }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`LLM endpoint вернул HTTP ${response.status}.`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) throw new Error('LLM вернула пустой ответ.');
  return content;
}

function combinedPrompt(context, prompt) {
  const transcript = [...context, { role: 'user', content: prompt }]
    .map((message) => `${message.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${message.content}`)
    .join('\n');
  const bounded = transcript.slice(-10_000);
  return [
    'Ты локальный домашний ассистент Jarvis. Отвечай по-русски, кратко и честно.',
    'Не выдумывай доступ к интернету, файлам или устройствам. Действия выполняются отдельными командами.',
    bounded,
    'Ассистент:',
  ].join('\n\n');
}

export class LocalLlm {
  constructor({ baseUrl, model, maxTokens, timeoutMs, store, userId, fetch: fetchImpl = globalThis.fetch }) {
    this.url = joinUrl(baseUrl, '/chat/completions');
    this.clearUrl = joinUrl(baseUrl, '/clear-kv-cache');
    this.model = model;
    this.maxTokens = Number(maxTokens);
    this.timeoutMs = Number(timeoutMs);
    this.store = store;
    this.userId = Number(userId);
    this.fetch = fetchImpl;
  }

  async clear() {
    const response = await this.fetch(this.clearUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`RKLLM KV reset вернул HTTP ${response.status}.`);
  }

  async answer(prompt) {
    await this.clear();
    const context = this.store.getContext(this.userId);
    const content = await postJson({
      fetchImpl: this.fetch,
      url: this.url,
      timeoutMs: this.timeoutMs,
      body: {
        model: this.model,
        messages: [{ role: 'user', content: combinedPrompt(context, prompt) }],
        max_tokens: this.maxTokens,
        stream: false,
        enable_thinking: false,
        temperature: 0.2,
        top_p: 0.8,
        top_k: 10,
        repeat_penalty: 1.2,
      },
    });
    this.store.addMessage(this.userId, 'user', prompt);
    this.store.addMessage(this.userId, 'assistant', content);
    return content;
  }
}

export class DeepSeekLlm {
  constructor({
    baseUrl,
    apiKey,
    dailyLimit,
    maxTokens,
    limiter,
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = 60_000,
  }) {
    this.url = joinUrl(baseUrl, '/chat/completions');
    this.apiKey = apiKey;
    this.dailyLimit = Number(dailyLimit);
    this.maxTokens = Math.min(Number(maxTokens), 1500);
    this.limiter = limiter;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async answer(prompt) {
    if (!this.apiKey) throw new Error('Облачная модель не настроена.');
    if (!this.limiter.consume('deepseek', this.dailyLimit)) {
      throw new Error('Исчерпан дневной лимит DeepSeek.');
    }
    return postJson({
      fetchImpl: this.fetch,
      url: this.url,
      timeoutMs: this.timeoutMs,
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: String(prompt).slice(0, 20_000) }],
        max_tokens: this.maxTokens,
        stream: false,
      },
    });
  }
}
