import { RawQuote } from '../rates/quote.model';
import { moexTimeOnDate, parseMoexDateTime } from './moex-time';

/** Минимальный срез ответа ISS, с которым работаем */
interface IssBlock {
  columns: string[];
  data: unknown[][];
}

interface IssResponse {
  securities?: IssBlock;
  marketdata?: IssBlock;
}

function rowBySecid(block: IssBlock | undefined): Map<string, Map<string, unknown>> {
  const out = new Map<string, Map<string, unknown>>();
  // сетевые данные не доверяем: кривой ответ = пустая карта, а не исключение
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.data)) return out;
  const secidIdx = block.columns.indexOf('SECID');
  if (secidIdx < 0) return out;
  for (const row of block.data) {
    if (!Array.isArray(row)) continue;
    const map = new Map<string, unknown>();
    block.columns.forEach((col, i) => map.set(col, row[i]));
    out.set(String(row[secidIdx]), map);
  }
  return out;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const positiveNum = (v: unknown): number | null => {
  const value = num(v);
  return value !== null && value > 0 ? value : null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function timesFrom(md: Map<string, unknown> | undefined): {
  time: Date | null;
  systime: Date | null;
} {
  const systime = parseMoexDateTime(str(md?.get('SYSTIME')));
  const time = moexTimeOnDate(str(md?.get('TIME')), systime);
  return { time, systime };
}

/** Валютный спот MOEX (сейчас CNY и золото): LAST, затем MARKETPRICE. */
export function parseCurrencyBatch(
  json: unknown,
  mapping: readonly { id: string; secid: string }[],
): RawQuote[] {
  const md = rowBySecid((json as IssResponse).marketdata);
  return mapping.map(({ id, secid }) => {
    const row = md.get(secid);
    const value = num(row?.get('LAST')) ?? num(row?.get('MARKETPRICE'));
    const { time, systime } = timesFrom(row);
    return { instrumentId: id, value, time, systime };
  });
}

/** Индекс: цена живёт в CURRENTVALUE */
export function parseIndexQuote(json: unknown, instrumentId: string): RawQuote {
  const md = rowBySecid((json as IssResponse).marketdata);
  const row = md.values().next().value as Map<string, unknown> | undefined;
  const { time, systime } = timesFrom(row);
  return {
    instrumentId,
    value: num(row?.get('CURRENTVALUE')) ?? num(row?.get('LAST')),
    time,
    systime,
  };
}

/**
 * Фьючерсы FORTS: из листинга доски выбираем ближайший контракт
 * по ASSETCODE (экспирация >= сегодня МСК), цену — из marketdata той же выборки.
 */
export function parseFuturesBatch(
  json: unknown,
  assets: readonly { id: string; assetCode: string; priceMultiplier?: number }[],
  today: Date,
): RawQuote[] {
  const resp = json as IssResponse;
  const sec = resp.securities;
  const md = rowBySecid(resp.marketdata);
  if (!sec) {
    return assets.map(({ id }) => ({ instrumentId: id, value: null, time: null, systime: null }));
  }

  const colSecid = sec.columns.indexOf('SECID');
  const colAsset = sec.columns.indexOf('ASSETCODE');
  const colExpiry = sec.columns.indexOf('LASTTRADEDATE');
  const todayYmd = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });

  return assets.map(({ id, assetCode, priceMultiplier = 1 }) => {
    const candidates = sec.data
      .filter((row) => row[colAsset] === assetCode)
      .map((row) => ({
        secid: String(row[colSecid]),
        expiry: String(row[colExpiry] ?? ''),
        last: positiveNum(md.get(String(row[colSecid]))?.get('LAST')),
        settle: positiveNum(md.get(String(row[colSecid]))?.get('SETTLEPRICE')),
      }));

    // Сначала берём ближайший проторгованный контракт. Settlement-only нужен
    // лишь как честно помеченный fallback, когда LAST нет ни у одного контракта.
    const tradable = candidates.filter((c) => c.expiry >= todayYmd);
    const pool = tradable.length > 0 ? tradable : candidates;
    const sorted = [...pool].sort((a, b) => a.expiry.localeCompare(b.expiry));
    const chosen = sorted.find((candidate) => candidate.last !== null)
      ?? sorted.find((candidate) => candidate.settle !== null);

    if (!chosen) {
      return { instrumentId: id, value: null, time: null, systime: null };
    }
    const { time, systime } = timesFrom(md.get(chosen.secid));
    const rawPrice = chosen.last ?? chosen.settle;
    return {
      instrumentId: id,
      value: rawPrice === null ? null : rawPrice * priceMultiplier,
      time,
      systime,
      priceType: chosen.last !== null ? 'last' : 'settlement',
    };
  });
}
