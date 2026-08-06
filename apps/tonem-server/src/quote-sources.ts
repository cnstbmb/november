/**
 * Thin HTTP clients for MOEX ISS and Binance, using global fetch (Node 20+).
 * Mirrors apps/tonem/src/app/core/moex/moex-iss.service.ts endpoints.
 */
import { Injectable } from '@nestjs/common';

const ISS_BASE = 'https://iss.moex.com/iss';
const BINANCE_TICKER = 'https://api.binance.com/api/v3/ticker/price';
const KRAKEN_BASE = 'https://api.kraken.com/0/public';
const CBR_DAILY = 'https://www.cbr.ru/scripts/XML_daily.asp';

const FETCH_TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/xml' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

@Injectable()
export class QuoteSourcesService {
  private cbrCache: { body: string; expiresAt: number } | null = null;

  /** Official daily rates, cached to avoid polling the CBR endpoint every minute. */
  async fetchCbrDailyXml(): Promise<string> {
    const now = Date.now();
    if (this.cbrCache && this.cbrCache.expiresAt > now) return this.cbrCache.body;
    const body = await getText(CBR_DAILY);
    this.cbrCache = { body, expiresAt: now + 15 * 60_000 };
    return body;
  }

  /** One batched request for all currency secids. */
  async fetchCurrencyBatch(secids: readonly string[]): Promise<unknown> {
    const url = `${ISS_BASE}/engines/currency/markets/selt/boards/CETS/securities.json?${qs({
      'iss.meta': 'off',
      'iss.only': 'marketdata',
      securities: secids.join(','),
      'marketdata.columns': 'SECID,LAST,MARKETPRICE,TIME,SYSTIME',
    })}`;
    return getJson(url);
  }

  async fetchIndex(secid: string): Promise<unknown> {
    const url = `${ISS_BASE}/engines/stock/markets/index/securities/${secid}.json?${qs({
      'iss.meta': 'off',
      'iss.only': 'marketdata',
      'marketdata.columns': 'SECID,CURRENTVALUE,LAST,TIME,SYSTIME',
    })}`;
    return getJson(url);
  }

  async fetchFuturesBoard(): Promise<unknown> {
    const url = `${ISS_BASE}/engines/futures/markets/forts/boards/RFUD/securities.json?${qs({
      'iss.meta': 'off',
      'iss.only': 'securities,marketdata',
      'securities.columns': 'SECID,ASSETCODE,LASTTRADEDATE',
      'marketdata.columns': 'SECID,LAST,SETTLEPRICE,OPENPOSITION,TIME,SYSTIME',
    })}`;
    return getJson(url);
  }

  /**
   * Binance REST price for a set of symbols. Uses the ?symbols=["A","B"] form.
   * The symbols param must be a JSON array literal (already compact-encoded).
   */
  async fetchBinancePrices(symbols: readonly string[]): Promise<unknown> {
    const symbolsJson = JSON.stringify(symbols);
    const url = `${BINANCE_TICKER}?symbols=${encodeURIComponent(symbolsJson)}`;
    return getJson(url);
  }

  /** Pair status is required because ticker keeps the last price after a halt. */
  async fetchKrakenTicker(pair: string): Promise<unknown> {
    const info = await getJson(`${KRAKEN_BASE}/AssetPairs?${qs({ pair })}`);
    const result = (info as { result?: Record<string, { status?: unknown }> } | null)?.result;
    const status = result ? Object.values(result)[0]?.status : undefined;
    if (status !== 'online') return { pair, status, ticker: null };

    const ticker = await getJson(`${KRAKEN_BASE}/Ticker?${qs({ pair })}`);
    return { pair, status, ticker };
  }
}
