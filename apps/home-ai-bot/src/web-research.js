const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

function plainText(value) {
  const entities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity) => {
      const normalized = entity.toLowerCase();
      const numeric = normalized.startsWith('#x')
        ? Number.parseInt(normalized.slice(2), 16)
        : normalized.startsWith('#') ? Number.parseInt(normalized.slice(1), 10) : null;
      if (numeric !== null) {
        return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10FFFF
          ? String.fromCodePoint(numeric)
          : match;
      }
      return entities[normalized] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] === 0;
}

export function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIpv4(hostname)) return false;
    if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')) return false;
    return true;
  } catch {
    return false;
  }
}

export class WebResearch {
  constructor({ apiKey, vpnGuard, limiter, dailyLimit = 100, fetch: fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
    this.apiKey = apiKey;
    this.vpnGuard = vpnGuard;
    this.limiter = limiter;
    this.dailyLimit = Number(dailyLimit);
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async answer(query) {
    if (!await this.vpnGuard.isAvailable()) {
      return { text: 'интернет-поиск временно недоступен', citations: [] };
    }
    if (!this.limiter.consume('brave', this.dailyLimit)) {
      throw new Error('Исчерпан дневной лимит интернет-поиска.');
    }

    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set('q', String(query).slice(0, 500));
    url.searchParams.set('count', '5');
    url.searchParams.set('safesearch', 'moderate');

    const response = await this.fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': this.apiKey,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Brave Search вернул HTTP ${response.status}.`);

    const payload = await response.json();
    const citations = (payload.web?.results ?? [])
      .filter((item) => isPublicHttpUrl(item.url))
      .slice(0, 5)
      .map((item) => ({
        title: plainText(item.title ?? 'Источник').slice(0, 200),
        url: item.url,
        description: plainText(item.description ?? '').slice(0, 600),
      }));

    const text = citations.length === 0
      ? 'Brave Search не нашёл подходящих публичных источников.'
      : citations.map((item, index) => `${index + 1}. ${item.title}: ${item.description}`).join('\n\n');
    return { text, citations };
  }
}
