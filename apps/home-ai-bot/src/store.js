import { DatabaseSync } from 'node:sqlite';

const DAY_MS = 24 * 60 * 60 * 1000;

export class PersistentStore {
  constructor(filename, options = {}) {
    this.historyTtlDays = Number(options.historyTtlDays ?? 7);
    this.historyMaxMessages = Number(options.historyMaxMessages ?? 30);
    this.auditTtlDays = Number(options.auditTtlDays ?? 30);
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS pairings (
        user_id INTEGER PRIMARY KEY,
        paired_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_user_created_idx
        ON messages (user_id, created_at_ms DESC, id DESC);

      CREATE TABLE IF NOT EXISTS daily_usage (
        day TEXT NOT NULL,
        kind TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (day, kind)
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events (created_at_ms);
    `);
  }

  isPaired(userId) {
    return Boolean(this.db.prepare('SELECT 1 FROM pairings WHERE user_id = ?').get(Number(userId)));
  }

  pair(userId, now = new Date()) {
    this.db.prepare(`
      INSERT INTO pairings (user_id, paired_at_ms) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET paired_at_ms = excluded.paired_at_ms
    `).run(Number(userId), now.getTime());
    this.audit('pairing', { userId: Number(userId) }, now);
  }

  addMessage(userId, role, content, now = new Date()) {
    if (!['system', 'user', 'assistant'].includes(role)) throw new Error('Unsupported message role.');
    const bounded = String(content).slice(0, 20_000);
    this.db.prepare(`
      INSERT INTO messages (user_id, role, content, created_at_ms) VALUES (?, ?, ?, ?)
    `).run(Number(userId), role, bounded, now.getTime());
  }

  getContext(userId, now = new Date()) {
    this.cleanup(now);
    return this.db.prepare(`
      SELECT role, content, created_at_ms AS createdAtMs
      FROM messages
      WHERE user_id = ?
      ORDER BY created_at_ms DESC, id DESC
      LIMIT ?
    `).all(Number(userId), this.historyMaxMessages).reverse();
  }

  clear(userId) {
    this.db.prepare('DELETE FROM messages WHERE user_id = ?').run(Number(userId));
    this.audit('history.clear', { userId: Number(userId) });
  }

  privacy(userId) {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM messages WHERE user_id = ?').get(Number(userId));
    return {
      historyMessages: Number(row.count),
      historyTtlDays: this.historyTtlDays,
      historyMaxMessages: this.historyMaxMessages,
      auditTtlDays: this.auditTtlDays,
      backupsEnabled: false,
    };
  }

  consume(kind, limit, now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare(`
        SELECT count FROM daily_usage WHERE day = ? AND kind = ?
      `).get(day, kind);
      if (Number(current?.count ?? 0) >= Number(limit)) {
        this.db.exec('ROLLBACK');
        return false;
      }
      this.db.prepare(`
        INSERT INTO daily_usage (day, kind, count) VALUES (?, ?, 1)
        ON CONFLICT(day, kind) DO UPDATE SET count = count + 1
      `).run(day, kind);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  audit(event, detail, now = new Date()) {
    this.db.prepare(`
      INSERT INTO audit_events (event, detail_json, created_at_ms) VALUES (?, ?, ?)
    `).run(String(event).slice(0, 100), JSON.stringify(detail ?? {}), now.getTime());
  }

  cleanup(now = new Date()) {
    this.db.prepare('DELETE FROM messages WHERE created_at_ms < ?')
      .run(now.getTime() - this.historyTtlDays * DAY_MS);
    this.db.prepare('DELETE FROM audit_events WHERE created_at_ms < ?')
      .run(now.getTime() - this.auditTtlDays * DAY_MS);
    this.db.prepare('DELETE FROM daily_usage WHERE day < ?')
      .run(new Date(now.getTime() - 2 * DAY_MS).toISOString().slice(0, 10));
  }

  close() {
    this.db.close();
  }
}
