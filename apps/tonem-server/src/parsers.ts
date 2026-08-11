/**
 * Pure parsing / mapping logic: raw MOEX ISS + Binance responses -> ticks.
 * No IO, no Nest, no Prisma — trivially unit-testable. Ported from
 * apps/tonem/src/app/core/moex/moex-iss.parser.ts.
 */
import { moexTimeOnDate, parseMoexDateTime } from './moex-time';

/** A normalized tick ready to persist. ts is always defined (collector stamps it). */
export interface TickInput {
  instrument: string;
  ts: Date;
  value: number;
  meta?: Record<string, unknown>;
}

/** Minimal slice of an ISS response we work with. */
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

function makeTick(
  instrument: string,
  value: number | null,
  fallbackTs: Date,
  source: string,
  extra?: Record<string, unknown>,
): TickInput | null {
  if (value === null) return null;
  return {
    instrument,
    ts: fallbackTs,
    value,
    meta: { source, ...extra },
  };
}

function xmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function xmlNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Official Bank of Russia XML_daily response -> normalized daily FX ticks. */
export function parseCbrDailyXml(
  xml: unknown,
  mapping: readonly { id: string; cbrCode: string }[],
  ts: Date,
): TickInput[] {
  if (typeof xml !== 'string') return [];
  const dateMatch = xml.match(/<ValCurs\b[^>]*\bDate="(\d{2})\.(\d{2})\.(\d{4})"/i);
  if (!dateMatch) return [];
  const effectiveDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  const byCode = new Map<string, number>();
  for (const match of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/gi)) {
    const block = match[1];
    const code = xmlTag(block, 'CharCode');
    const nominal = xmlNumber(xmlTag(block, 'Nominal'));
    const rawValue = xmlNumber(xmlTag(block, 'Value'));
    if (code && nominal !== null && nominal > 0 && rawValue !== null && rawValue > 0) {
      byCode.set(code, rawValue / nominal);
    }
  }
  return mapping.flatMap(({ id, cbrCode }) => {
    const tick = makeTick(id, byCode.get(cbrCode) ?? null, ts, 'cbr', {
      cbrCode,
      effectiveDate,
    });
    return tick ? [tick] : [];
  });
}

/**
 * MOEX currency spot (currently CNY and gold): LAST with MARKETPRICE fallback.
 * Produces one tick per mapped instrument, timestamped at the collection minute.
 */
export function parseCurrencyBatch(
  json: unknown,
  mapping: readonly { id: string; secid: string }[],
  ts: Date,
): TickInput[] {
  const md = rowBySecid((json as IssResponse | null)?.marketdata);
  const out: TickInput[] = [];
  for (const { id, secid } of mapping) {
    const row = md.get(secid);
    const value = num(row?.get('LAST')) ?? num(row?.get('MARKETPRICE'));
    const { systime } = timesFrom(row);
    const tick = makeTick(id, value, ts, 'moex-currency', {
      secid,
      ...(systime ? { systime: systime.toISOString() } : {}),
    });
    if (tick) out.push(tick);
  }
  return out;
}

/** Index: value lives in CURRENTVALUE (fallback LAST). */
export function parseIndexQuote(
  json: unknown,
  instrumentId: string,
  ts: Date,
): TickInput | null {
  const md = rowBySecid((json as IssResponse | null)?.marketdata);
  const row = md.values().next().value as Map<string, unknown> | undefined;
  const value = num(row?.get('CURRENTVALUE')) ?? num(row?.get('LAST'));
  const { systime } = timesFrom(row);
  return makeTick(instrumentId, value, ts, 'moex-index', {
    ...(systime ? { systime: systime.toISOString() } : {}),
  });
}

/**
 * FORTS futures: from the board listing pick the nearest contract by ASSETCODE
 * (expiry >= today MSK), price from the same sample's marketdata.
 */
export function parseFuturesBatch(
  json: unknown,
  assets: readonly { id: string; assetCode: string; priceMultiplier?: number }[],
  today: Date,
  ts: Date,
): TickInput[] {
  const resp = json as IssResponse | null;
  const sec = resp?.securities;
  const md = rowBySecid(resp?.marketdata);
  if (!sec) return [];

  const colSecid = sec.columns.indexOf('SECID');
  const colAsset = sec.columns.indexOf('ASSETCODE');
  const colExpiry = sec.columns.indexOf('LASTTRADEDATE');
  const todayYmd = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });

  const out: TickInput[] = [];
  for (const { id, assetCode, priceMultiplier = 1 } of assets) {
    const candidates = sec.data
      .filter((row) => row[colAsset] === assetCode)
      .map((row) => ({
        secid: String(row[colSecid]),
        expiry: String(row[colExpiry] ?? ''),
        last: positiveNum(md.get(String(row[colSecid]))?.get('LAST')),
        settle: positiveNum(md.get(String(row[colSecid]))?.get('SETTLEPRICE')),
      }));

    // Prefer the nearest actually traded contract. Settlement-only is retained
    // as an explicitly tagged fallback when no contract has a positive LAST.
    const tradable = candidates.filter((c) => c.expiry >= todayYmd);
    const pool = tradable.length > 0 ? tradable : candidates;
    const sorted = [...pool].sort((a, b) => a.expiry.localeCompare(b.expiry));
    const chosen = sorted.find((candidate) => candidate.last !== null)
      ?? sorted.find((candidate) => candidate.settle !== null);

    if (!chosen) continue;
    const { systime } = timesFrom(md.get(chosen.secid));
    const rawPrice = chosen.last ?? chosen.settle;
    const tick = makeTick(id, rawPrice === null ? null : rawPrice * priceMultiplier, ts, 'moex-futures', {
      assetCode,
      secid: chosen.secid,
      expiry: chosen.expiry,
      priceType: chosen.last !== null ? 'last' : 'settlement',
      ...(priceMultiplier !== 1 ? { rawPrice, priceMultiplier } : {}),
      ...(systime ? { systime: systime.toISOString() } : {}),
    });
    if (tick) out.push(tick);
  }
  return out;
}

/** Binance REST ticker/price response -> ticks. Accepts the array form. */
export function parseBinancePrices(
  json: unknown,
  mapping: readonly { id: string; symbol: string }[],
  ts: Date,
): TickInput[] {
  const bySymbol = new Map<string, number>();
  if (Array.isArray(json)) {
    for (const entry of json) {
      if (entry && typeof entry === 'object') {
        const sym = (entry as { symbol?: unknown }).symbol;
        const price = (entry as { price?: unknown }).price;
        const p = typeof price === 'string' ? Number(price) : num(price);
        if (typeof sym === 'string' && p !== null && Number.isFinite(p)) {
          bySymbol.set(sym, p);
        }
      }
    }
  }
  const out: TickInput[] = [];
  for (const { id, symbol } of mapping) {
    const value = bySymbol.get(symbol) ?? null;
    const tick = makeTick(id, value, ts, 'binance', { symbol });
    if (tick) out.push(tick);
  }
  return out;
}

/** Kraken REST ticker guarded by the AssetPairs status from QuoteSourcesService. */
export function parseKrakenTicker(
  json: unknown,
  mapping: readonly { id: string; pair: string }[],
  ts: Date,
): TickInput[] {
  if (!json || typeof json !== 'object') return [];
  const envelope = json as {
    pair?: unknown;
    status?: unknown;
    ticker?: { error?: unknown; result?: Record<string, { c?: unknown }> } | null;
  };
  if (envelope.status !== 'online' || typeof envelope.pair !== 'string') return [];
  if (!Array.isArray(envelope.ticker?.error) || envelope.ticker.error.length > 0) return [];

  const id = mapping.find(({ pair }) => pair === envelope.pair)?.id;
  const result = envelope.ticker?.result;
  const row = result?.[envelope.pair] ?? (result ? Object.values(result)[0] : undefined);
  const close = Array.isArray(row?.c) ? row.c[0] : undefined;
  const value = typeof close === 'string' ? Number(close) : num(close);
  if (!id || value === null || !Number.isFinite(value)) return [];

  const tick = makeTick(id, value, ts, 'kraken', { pair: envelope.pair });
  return tick ? [tick] : [];
}
