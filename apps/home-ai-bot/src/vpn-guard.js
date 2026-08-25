export class VpnGuard {
  constructor({
    routerApiUrl,
    selector,
    probeUrl,
    fetch: fetchImpl = globalThis.fetch,
    timeoutMs = 5_000,
  }) {
    this.routerApiUrl = String(routerApiUrl).replace(/\/$/, '');
    this.selector = selector;
    this.probeUrl = probeUrl;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async isAvailable() {
    try {
      const url = new URL(`${this.routerApiUrl}/proxies/${encodeURIComponent(this.selector)}/delay`);
      url.searchParams.set('timeout', String(this.timeoutMs));
      url.searchParams.set('url', this.probeUrl);
      const response = await this.fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs + 500),
        redirect: 'error',
      });
      if (!response.ok) return false;
      const payload = await response.json();
      return Number.isFinite(payload.delay) && payload.delay > 0 && payload.delay <= this.timeoutMs;
    } catch {
      return false;
    }
  }
}
