/**
 * Server-side mirror of the canonical instrument registry
 * (apps/tonem/src/app/core/instruments/instrument.registry.ts).
 *
 * Only LIVE instruments are collected and stored — the 6 derived
 * instruments are computed on the fly by the frontend and are NOT stored.
 */

export type MarketKind = 'fx' | 'futures' | 'index' | 'crypto';

export type MoexRef =
  | { readonly kind: 'currency'; readonly secid: string }
  | { readonly kind: 'index'; readonly secid: string }
  | { readonly kind: 'futures'; readonly assetCode: string };

export interface BinanceRef {
  readonly symbol: string;
}

export interface KrakenRef {
  readonly pair: string;
}

export interface LiveInstrument {
  readonly id: string;
  readonly market: MarketKind;
  readonly moex?: MoexRef;
  readonly binance?: BinanceRef;
  readonly kraken?: KrakenRef;
}

/**
 * The 14 LIVE instruments, in the canonical ticker order.
 * Kept intentionally minimal (id / market / source) — labels, units and
 * decimals are a presentation concern owned by the frontend.
 */
export const LIVE_INSTRUMENTS: readonly LiveInstrument[] = [
  // FX (MOEX CETS)
  { id: 'usdrub', market: 'fx', moex: { kind: 'currency', secid: 'USD000UTSTOM' } },
  { id: 'eurrub', market: 'fx', moex: { kind: 'currency', secid: 'EUR_RUB__TOM' } },
  { id: 'cnyrub', market: 'fx', moex: { kind: 'currency', secid: 'CNYRUB_TOM' } },
  { id: 'gold', market: 'fx', moex: { kind: 'currency', secid: 'GLDRUB_TOM' } },

  // Index
  { id: 'imoex', market: 'index', moex: { kind: 'index', secid: 'IMOEX' } },

  // Commodities (MOEX FORTS futures board RFUD)
  { id: 'brent', market: 'futures', moex: { kind: 'futures', assetCode: 'BR' } },
  { id: 'wheat', market: 'futures', moex: { kind: 'futures', assetCode: 'WHEAT' } },
  { id: 'ai95', market: 'futures', moex: { kind: 'futures', assetCode: 'AI95' } },
  { id: 'coffee', market: 'futures', moex: { kind: 'futures', assetCode: 'COFFEE' } },
  { id: 'oj', market: 'futures', moex: { kind: 'futures', assetCode: 'ORANGE' } },
  { id: 'sugar', market: 'futures', moex: { kind: 'futures', assetCode: 'SUGAR' } },

  // Crypto (Binance, 24/7)
  { id: 'btc', market: 'crypto', binance: { symbol: 'BTCUSDT' } },
  { id: 'eth', market: 'crypto', binance: { symbol: 'ETHUSDT' } },
  {
    id: 'ton',
    market: 'crypto',
    // Binance is retained for pre-break historical candles only. Live TON
    // comes from Kraken because every Binance TON spot pair is paused.
    binance: { symbol: 'TONUSDT' },
    kraken: { pair: 'TONUSD' },
  },
] as const;

export function instrumentsByMarket(kind: MarketKind): LiveInstrument[] {
  return LIVE_INSTRUMENTS.filter((i) => i.market === kind);
}

export function currencySecids(): string[] {
  return LIVE_INSTRUMENTS.filter((i) => i.moex?.kind === 'currency').map(
    (i) => (i.moex as { secid: string }).secid,
  );
}

export function indexSecids(): { id: string; secid: string }[] {
  return LIVE_INSTRUMENTS.filter((i) => i.moex?.kind === 'index').map((i) => ({
    id: i.id,
    secid: (i.moex as { secid: string }).secid,
  }));
}

export function futuresAssets(): { id: string; assetCode: string }[] {
  return LIVE_INSTRUMENTS.filter((i) => i.moex?.kind === 'futures').map((i) => ({
    id: i.id,
    assetCode: (i.moex as { assetCode: string }).assetCode,
  }));
}

export function binanceSymbols(): { id: string; symbol: string }[] {
  return LIVE_INSTRUMENTS.filter((i) => i.binance && !i.kraken).map((i) => ({
    id: i.id,
    symbol: i.binance!.symbol,
  }));
}

export function krakenPairs(): { id: string; pair: string }[] {
  return LIVE_INSTRUMENTS.filter((i) => i.kraken).map((i) => ({
    id: i.id,
    pair: i.kraken!.pair,
  }));
}

export function isKnownInstrument(id: string): boolean {
  return LIVE_INSTRUMENTS.some((i) => i.id === id);
}
