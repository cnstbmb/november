import { Candle } from './candle.model';

function number(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseKrakenOhlc(json: unknown): Candle[] {
  const result = (json as { error?: unknown; result?: Record<string, unknown> } | null)?.result;
  if (
    !result ||
    !Array.isArray((json as { error?: unknown }).error) ||
    (json as { error: unknown[] }).error.length > 0
  )
    return [];
  const rows = Object.entries(result).find(
    ([key, value]) => key !== 'last' && Array.isArray(value),
  )?.[1];
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const seconds = number(row[0]);
    const open = number(row[1]);
    const high = number(row[2]);
    const low = number(row[3]);
    const close = number(row[4]);
    if (seconds === null || close === null) continue;
    out.push({
      ts: new Date(seconds * 1000),
      close,
      ...(open !== null ? { open } : {}),
      ...(high !== null ? { high } : {}),
      ...(low !== null ? { low } : {}),
    });
  }
  return out;
}
