import { RawQuote } from '../rates/quote.model';

/** Срез combined-сообщения Binance: обёртка { stream, data }. */
interface CombinedEnvelope {
  stream?: unknown;
  data?: unknown;
}

/** Поля 24hrMiniTicker, с которыми работаем (остальное игнорируем). */
interface MiniTickerData {
  e?: unknown; // тип события
  E?: unknown; // event time, ms epoch
  s?: unknown; // символ "BTCUSDT"
  c?: unknown; // close price (строка)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const finiteNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const eventTime = (v: unknown): Date | null => {
  const ms = finiteNumber(v);
  return ms === null ? null : new Date(ms);
};

/**
 * Разбор одного miniTicker-payload'а (поле data) в RawQuote.
 * Цена — close (поле c), время/систайм — event time (поле E).
 * Неизвестный символ или отсутствующий id → пустой массив.
 */
export function parseMiniTicker(
  data: unknown,
  symbolToId: ReadonlyMap<string, string>,
): RawQuote[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as MiniTickerData;
  const symbol = str(d.s);
  const id = symbol ? symbolToId.get(symbol) : undefined;
  if (!id) return [];
  const at = eventTime(d.E);
  return [{ instrumentId: id, value: finiteNumber(d.c), time: at, systime: at }];
}

/**
 * Разбор кадра combined-стрима. Принимает и строку (сырой WS data),
 * и уже распарсенный объект. Битый кадр → пустой массив, стрим не роняем.
 */
export function parseCombinedMessage(
  frame: unknown,
  symbolToId: ReadonlyMap<string, string>,
): RawQuote[] {
  let json: unknown = frame;
  if (typeof frame === 'string') {
    try {
      json = JSON.parse(frame);
    } catch {
      return [];
    }
  }
  if (!json || typeof json !== 'object') return [];
  return parseMiniTicker((json as CombinedEnvelope).data, symbolToId);
}
