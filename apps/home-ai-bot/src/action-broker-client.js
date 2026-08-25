import http from 'node:http';

export class ActionBrokerClient {
  constructor({ socketPath, token, timeoutMs = 10_000 }) {
    this.socketPath = socketPath;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  get(path = '/v1/status') {
    return new Promise((resolve, reject) => {
      const request = http.request({
        socketPath: this.socketPath,
        path,
        method: 'GET',
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: this.timeoutMs,
      }, (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
          if (responseBody.length > 16_384) {
            response.destroy(new Error('Action broker response is too large.'));
          }
        });
        response.on('error', reject);
        response.on('end', () => {
          const statusCode = response.statusCode ?? 500;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`Action broker вернул HTTP ${statusCode}: ${responseBody.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            reject(new Error('Action broker вернул некорректный JSON.'));
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('Action broker timeout.')));
      request.on('error', reject);
      request.end();
    });
  }

  storage() {
    return this.get('/v1/storage');
  }

  services() {
    return this.get('/v1/services');
  }

  network() {
    return this.get('/v1/network');
  }

  restart(service) {
    const body = Buffer.from(JSON.stringify({ service }));
    return new Promise((resolve, reject) => {
      const request = http.request({
        socketPath: this.socketPath,
        path: '/v1/restart',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': body.length,
        },
        timeout: this.timeoutMs,
      }, (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { responseBody += chunk; });
        response.on('end', () => {
          if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) resolve();
          else reject(new Error(`Action broker вернул HTTP ${response.statusCode}: ${responseBody.slice(0, 200)}`));
        });
      });
      request.on('timeout', () => request.destroy(new Error('Action broker timeout.')));
      request.on('error', reject);
      request.end(body);
    });
  }
}
