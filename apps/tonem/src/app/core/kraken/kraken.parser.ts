import { RawQuote } from '../rates/quote.model';

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseKrakenTickerMessage(
  frame: unknown,
  pairToId: ReadonlyMap<string, string>,
): RawQuote[] {
  let json = frame;
  if (typeof frame === 'string') {
    try {
      json = JSON.parse(frame) as unknown;
    } catch {
      return [];
    }
  }
  if (!json || typeof json !== 'object') return [];
  const envelope = json as { channel?: unknown; data?: unknown };
  if (envelope.channel !== 'ticker' || !Array.isArray(envelope.data)) return [];

  const out: RawQuote[] = [];
  for (const candidate of envelope.data) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as { symbol?: unknown; last?: unknown; timestamp?: unknown };
    const id = typeof row.symbol === 'string' ? pairToId.get(row.symbol) : undefined;
    const value = finiteNumber(row.last);
    const timestamp = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
    if (!id || value === null || !Number.isFinite(timestamp)) continue;
    const at = new Date(timestamp);
    out.push({ instrumentId: id, value, time: at, systime: at });
  }
  return out;
}
