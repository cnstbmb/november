/** Pure parsers for MOEX ISS and Binance backfill responses. */

export interface CandleRow {
  /** Timestamp at which the candle value became known. */
  ts: Date;
  close: number;
  /** Binance open time, used only to verify and advance its pagination cursor. */
  openTs?: Date;
}

interface IssBlock {
  columns: string[];
  data: unknown[][];
}

export interface IssCursor {
  index: number;
  total: number;
  pageSize: number;
}

export interface FuturesContract {
  secid: string;
  assetCode: string;
  firstTrade: Date;
  lastTradeExclusive: Date;
}

function getIssBlock(json: unknown, name: string): IssBlock | null {
  if (typeof json !== 'object' || json === null) return null;
  const value = (json as Record<string, unknown>)[name];
  if (typeof value !== 'object' || value === null) return null;
  const columns = (value as Record<string, unknown>).columns;
  const data = (value as Record<string, unknown>).data;
  return Array.isArray(columns) && Array.isArray(data)
    ? { columns: columns as string[], data: data as unknown[][] }
    : null;
}

function parseMoscowDateTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const ms = Date.parse(`${value.replace(' ', 'T')}+03:00`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function parseMoscowDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return parseMoscowDateTime(`${value} 00:00:00`);
}

export function parseIssBlockRowCount(json: unknown, blockName: string): number {
  return getIssBlock(json, blockName)?.data.length ?? 0;
}

export function parseIssCursor(json: unknown, blockName: string): IssCursor | null {
  const cursor = getIssBlock(json, `${blockName}.cursor`);
  if (!cursor || cursor.data.length === 0) return null;
  const row = cursor.data[0];
  const indexColumn = cursor.columns.indexOf('INDEX');
  const totalColumn = cursor.columns.indexOf('TOTAL');
  const pageSizeColumn = cursor.columns.indexOf('PAGESIZE');
  if (indexColumn < 0 || totalColumn < 0 || pageSizeColumn < 0) return null;
  const index = Number(row[indexColumn]);
  const total = Number(row[totalColumn]);
  const pageSize = Number(row[pageSizeColumn]);
  return Number.isInteger(index) && Number.isInteger(total) && Number.isInteger(pageSize)
    && index >= 0 && total >= 0 && pageSize > 0
    ? { index, total, pageSize }
    : null;
}

/** MOEX `end` is Moscow local time and is the point at which close is known. */
export function parseMoexCandlesResponse(json: unknown): CandleRow[] {
  const candles = getIssBlock(json, 'candles');
  if (!candles) return [];
  const closeColumn = candles.columns.indexOf('close');
  const endColumn = candles.columns.indexOf('end');
  if (closeColumn < 0 || endColumn < 0) return [];

  const result: CandleRow[] = [];
  for (const row of candles.data) {
    if (!Array.isArray(row)) continue;
    const close = row[closeColumn];
    const ts = parseMoscowDateTime(row[endColumn]);
    if (typeof close !== 'number' || !Number.isFinite(close) || !ts) continue;
    result.push({ ts, close });
  }
  return result;
}

/** Binance closeTime (index 6), not openTime, prevents look-ahead in time travel. */
export function parseBinanceKlinesResponse(json: unknown): CandleRow[] {
  if (!Array.isArray(json)) return [];
  const result: CandleRow[] = [];
  for (const entry of json) {
    if (!Array.isArray(entry) || entry.length < 7) continue;
    const openTime = Number(entry[0]);
    const close = Number(entry[4]);
    const closeTime = Number(entry[6]);
    if (!Number.isFinite(openTime) || !Number.isFinite(close) || !Number.isFinite(closeTime)) {
      continue;
    }
    result.push({
      openTs: new Date(openTime),
      ts: new Date(closeTime),
      close,
    });
  }
  return result;
}

/** Extract exact-ASSETCODE contracts; rows with an empty ASSETCODE are spreads. */
export function parseFuturesHistoryResponse(json: unknown, assetCode: string): string[] {
  const history = getIssBlock(json, 'history');
  if (!history) return [];
  const secidColumn = history.columns.indexOf('SECID');
  const assetColumn = history.columns.indexOf('ASSETCODE');
  if (secidColumn < 0 || assetColumn < 0) return [];

  const secids = new Set<string>();
  for (const row of history.data) {
    if (!Array.isArray(row) || row[assetColumn] !== assetCode) continue;
    const secid = row[secidColumn];
    if (typeof secid === 'string' && secid.length > 0) secids.add(secid);
  }
  return [...secids];
}

/** Parse stable lifecycle fields exposed for both active and expired contracts. */
export function parseFuturesSecurityDescription(json: unknown): FuturesContract | null {
  const description = getIssBlock(json, 'description');
  if (!description) return null;
  const nameColumn = description.columns.indexOf('name');
  const valueColumn = description.columns.indexOf('value');
  if (nameColumn < 0 || valueColumn < 0) return null;

  const values = new Map<string, unknown>();
  for (const row of description.data) {
    if (!Array.isArray(row)) continue;
    const name = row[nameColumn];
    if (typeof name === 'string') values.set(name, row[valueColumn]);
  }

  const secid = values.get('SECID');
  const assetCode = values.get('ASSETCODE');
  const firstTrade = parseMoscowDate(values.get('FRSTTRADE'));
  const lastTrade = parseMoscowDate(values.get('LSTTRADE'));
  if (typeof secid !== 'string' || typeof assetCode !== 'string' || !firstTrade || !lastTrade) {
    return null;
  }

  return {
    secid,
    assetCode,
    firstTrade,
    lastTradeExclusive: new Date(lastTrade.getTime() + 24 * 60 * 60 * 1000),
  };
}
