import { Candle } from './candle.model';
import { parseMoexDateTime } from '../moex/moex-time';

/** Минимальный срез ответа ISS candles.json */
interface IssBlock {
  columns: string[];
  data: unknown[][];
}

interface CandlesResponse {
  candles?: IssBlock;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Разбор MOEX ISS candles.json в Candle[].
 * Колонки: open, close, high, low, value, volume, begin, end.
 * ts — begin (МСК-строка "2026-07-28 10:00:00"), close — цена закрытия.
 * Кривой ответ → пустой массив, без исключений.
 */
export function parseMoexCandles(json: unknown, priceMultiplier = 1): Candle[] {
  const block = (json as CandlesResponse)?.candles;
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) return [];

  const colBegin = block.columns.indexOf('begin');
  const colClose = block.columns.indexOf('close');
  const colOpen = block.columns.indexOf('open');
  const colHigh = block.columns.indexOf('high');
  const colLow = block.columns.indexOf('low');
  if (colBegin < 0 || colClose < 0) return [];

  const out: Candle[] = [];
  for (const row of block.data) {
    if (!Array.isArray(row)) continue;
    const ts = parseMoexDateTime(typeof row[colBegin] === 'string' ? row[colBegin] : null);
    const close = num(row[colClose]);
    if (!ts || close === null) continue;
    const open = colOpen >= 0 ? num(row[colOpen]) : null;
    const high = colHigh >= 0 ? num(row[colHigh]) : null;
    const low = colLow >= 0 ? num(row[colLow]) : null;
    out.push({
      ts,
      close: close * priceMultiplier,
      ...(open !== null ? { open: open * priceMultiplier } : {}),
      ...(high !== null ? { high: high * priceMultiplier } : {}),
      ...(low !== null ? { low: low * priceMultiplier } : {}),
    });
  }
  return out;
}
