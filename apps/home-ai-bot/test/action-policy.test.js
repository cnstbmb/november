import assert from 'node:assert/strict';
import test from 'node:test';

import { ActionPolicy, PolicyError } from '../src/action-policy.js';

test('allows only the three approved service restarts', () => {
  const policy = new ActionPolicy();

  for (const service of ['samba', 'qbittorrent', 'jellyfin']) {
    assert.deepEqual(policy.validate({ type: 'restart', service }), {
      type: 'restart',
      service,
    });
  }

  for (const service of ['docker', 'ssh', 'remnanode', 'dns', 'firewall']) {
    assert.throws(
      () => policy.validate({ type: 'restart', service }),
      PolicyError,
    );
  }
});

test('allows the approved qBittorrent operations without accepting shell-shaped input', () => {
  const policy = new ActionPolicy();
  const allowed = [
    { type: 'torrent.pause', hash: 'abc123' },
    { type: 'torrent.resume', hash: 'abc123' },
    { type: 'torrent.recheck', hash: 'abc123' },
    { type: 'torrent.delete', hash: 'abc123', deleteFiles: false },
    { type: 'torrent.delete', hash: 'abc123', deleteFiles: true },
    { type: 'torrent.add', magnet: 'magnet:?xt=urn:btih:ABC123' },
    { type: 'torrent.speed', direction: 'download', kibPerSecond: 4096 },
  ];

  for (const action of allowed) assert.deepEqual(policy.validate(action), action);

  assert.throws(() => policy.validate({ type: 'shell', command: 'rm -rf /' }), PolicyError);
  assert.throws(() => policy.validate({ type: 'torrent.pause', hash: 'abc; systemctl restart ssh' }), PolicyError);
  assert.throws(() => policy.validate({ type: 'torrent.add', magnet: 'https://example.com/file' }), PolicyError);
});
