import { Candle } from './candle.model';

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Разбор Binance klines (GET /api/v3/klines) в Candle[].
 * Каждая свеча — массив:
 *   [openTime, open, high, low, close, volume, closeTime, ...]
 * Цены — строки, время — ms epoch. Битый элемент пропускаем,
 * битый ответ целиком → пустой массив, без исключений.
 */
export function parseBinanceKlines(json: unknown): Candle[] {
  if (!Array.isArray(json)) return [];
  const out: Candle[] = [];
  for (const row of json) {
    if (!Array.isArray(row)) continue;
    const tsMs = num(row[0]);
    const open = num(row[1]);
    const high = num(row[2]);
    const low = num(row[3]);
    const close = num(row[4]);
    if (tsMs === null || close === null) continue;
    out.push({
      ts: new Date(tsMs),
      close,
      ...(open !== null ? { open } : {}),
      ...(high !== null ? { high } : {}),
      ...(low !== null ? { low } : {}),
    });
  }
  return out;
}
