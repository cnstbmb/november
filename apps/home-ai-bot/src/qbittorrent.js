function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}${path}`;
}

export class QbittorrentClient {
  constructor({ baseUrl, username, password, fetch: fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cookie = null;
  }

  async #login() {
    const body = new URLSearchParams({ username: this.username, password: this.password });
    const response = await this.fetch(joinUrl(this.baseUrl, '/api/v2/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.baseUrl,
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    const responseText = (await response.text()).trim();
    if (!response.ok || (responseText && responseText !== 'Ok.')) {
      throw new Error('qBittorrent authentication failed.');
    }
    this.cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!this.cookie) throw new Error('qBittorrent did not return a session cookie.');
  }

  async #post(path, fields, fallbackPath) {
    if (!this.cookie) await this.#login();
    const request = async (target) => this.fetch(joinUrl(this.baseUrl, target), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: this.cookie,
        Referer: this.baseUrl,
      },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    let response = await request(path);
    if (response.status === 403) {
      this.cookie = null;
      await this.#login();
      response = await request(path);
    }
    if (response.status === 404 && fallbackPath) response = await request(fallbackPath);
    if (!response.ok) throw new Error(`qBittorrent вернул HTTP ${response.status}.`);
  }

  async execute(action) {
    if (action.type === 'torrent.pause') return this.#post('/api/v2/torrents/stop', { hashes: action.hash }, '/api/v2/torrents/pause');
    if (action.type === 'torrent.resume') return this.#post('/api/v2/torrents/start', { hashes: action.hash }, '/api/v2/torrents/resume');
    if (action.type === 'torrent.recheck') return this.#post('/api/v2/torrents/recheck', { hashes: action.hash });
    if (action.type === 'torrent.delete') {
      return this.#post('/api/v2/torrents/delete', {
        hashes: action.hash,
        deleteFiles: String(action.deleteFiles),
      });
    }
    if (action.type === 'torrent.add') return this.#post('/api/v2/torrents/add', { urls: action.magnet });
    if (action.type === 'torrent.speed') {
      const endpoint = action.direction === 'download'
        ? '/api/v2/transfer/setDownloadLimit'
        : '/api/v2/transfer/setUploadLimit';
      return this.#post(endpoint, { limit: String(action.kibPerSecond * 1024) });
    }
    throw new Error('Unsupported qBittorrent action.');
  }

  async list() {
    if (!this.cookie) await this.#login();
    const response = await this.fetch(joinUrl(this.baseUrl, '/api/v2/torrents/info'), {
      headers: { Cookie: this.cookie, Referer: this.baseUrl },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`qBittorrent вернул HTTP ${response.status}.`);
    return response.json();
  }
}
