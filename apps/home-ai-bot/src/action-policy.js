export class PolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PolicyError';
  }
}

const RESTART_SERVICES = new Set(['samba', 'qbittorrent', 'jellyfin']);
const TORRENT_HASH = /^[a-fA-F0-9]{6,64}$/;

function requireTorrentHash(hash) {
  if (typeof hash !== 'string' || !TORRENT_HASH.test(hash)) {
    throw new PolicyError('Некорректный hash торрента.');
  }
}

export class ActionPolicy {
  validate(action) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      throw new PolicyError('Действие не распознано.');
    }

    if (action.type === 'restart') {
      if (!RESTART_SERVICES.has(action.service)) {
        throw new PolicyError('Перезапуск этого сервиса запрещён.');
      }
      return { type: 'restart', service: action.service };
    }

    if (['torrent.pause', 'torrent.resume', 'torrent.recheck'].includes(action.type)) {
      requireTorrentHash(action.hash);
      return { type: action.type, hash: action.hash };
    }

    if (action.type === 'torrent.delete') {
      requireTorrentHash(action.hash);
      if (typeof action.deleteFiles !== 'boolean') {
        throw new PolicyError('Режим удаления должен быть указан явно.');
      }
      return { type: action.type, hash: action.hash, deleteFiles: action.deleteFiles };
    }

    if (action.type === 'torrent.add') {
      if (
        typeof action.magnet !== 'string'
        || action.magnet.length > 8192
        || !action.magnet.startsWith('magnet:?')
      ) {
        throw new PolicyError('Разрешены только magnet-ссылки.');
      }
      const magnet = new URL(action.magnet);
      if (!magnet.searchParams.getAll('xt').some((value) => value.startsWith('urn:btih:'))) {
        throw new PolicyError('Magnet-ссылка не содержит BTIH.');
      }
      return { type: action.type, magnet: action.magnet };
    }

    if (action.type === 'torrent.speed') {
      if (!['download', 'upload'].includes(action.direction)) {
        throw new PolicyError('Неизвестное направление ограничения скорости.');
      }
      if (
        !Number.isSafeInteger(action.kibPerSecond)
        || action.kibPerSecond < 0
        || action.kibPerSecond > 1_048_576
      ) {
        throw new PolicyError('Недопустимое ограничение скорости.');
      }
      return {
        type: action.type,
        direction: action.direction,
        kibPerSecond: action.kibPerSecond,
      };
    }

    throw new PolicyError('Действие запрещено политикой.');
  }
}
