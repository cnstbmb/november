export class ActionExecutor {
  constructor({ broker, qbittorrent, audit }) {
    this.broker = broker;
    this.qbittorrent = qbittorrent;
    this.audit = audit;
  }

  async execute(action) {
    if (action.type === 'restart') await this.broker.restart(action.service);
    else if (action.type.startsWith('torrent.')) await this.qbittorrent.execute(action);
    else throw new Error('Действие не поддерживается исполнителем.');
    this.audit.audit('action.execute', action);
  }
}
