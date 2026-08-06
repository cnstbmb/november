import { describe, expect, it } from 'vitest';
import {
  parseBinancePrices,
  parseCbrDailyXml,
  parseCurrencyBatch,
  parseFuturesBatch,
  parseIndexQuote,
  parseKrakenTicker,
} from '../src/parsers';

const TS = new Date('2026-07-28T19:15:00.000Z');

describe('parseCbrDailyXml', () => {
  it('normalizes official CBR rates by nominal', () => {
    const xml = `<?xml version="1.0" encoding="windows-1251"?>
      <ValCurs Date="29.07.2026" name="Foreign Currency Market">
        <Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Value>78,6980</Value></Valute>
        <Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>89,6292</Value></Valute>
        <Valute ID="R01375"><NumCode>156</NumCode><CharCode>CNY</CharCode><Nominal>10</Nominal><Value>115,9110</Value></Valute>
      </ValCurs>`;
    const ticks = parseCbrDailyXml(xml, [
      { id: 'usdrub', cbrCode: 'USD' },
      { id: 'eurrub', cbrCode: 'EUR' },
      { id: 'cnyrub', cbrCode: 'CNY' },
    ], TS);
    expect(ticks.map((tick) => [tick.instrument, tick.value])).toEqual([
      ['usdrub', 78.698],
      ['eurrub', 89.6292],
      ['cnyrub', 11.5911],
    ]);
    expect(ticks[0].meta).toMatchObject({
      source: 'cbr',
      cbrCode: 'USD',
      effectiveDate: '2026-07-29',
    });
  });

  it('rejects malformed or non-positive rates', () => {
    expect(parseCbrDailyXml('<html>oops</html>', [{ id: 'usdrub', cbrCode: 'USD' }], TS))
      .toEqual([]);
  });
});

describe('parseCurrencyBatch', () => {
  const mapping = [
    { id: 'usdrub', secid: 'USD000UTSTOM' },
    { id: 'eurrub', secid: 'EUR_RUB__TOM' },
  ];

  it('maps LAST and falls back to MARKETPRICE when LAST is null', () => {
    const json = {
      marketdata: {
        columns: ['SECID', 'LAST', 'MARKETPRICE', 'TIME', 'SYSTIME'],
        data: [
          ['USD000UTSTOM', 91.25, 91.2, '18:41:09', '2026-07-28 19:15:00'],
          ['EUR_RUB__TOM', null, 102.5, '18:41:09', '2026-07-28 19:15:00'],
        ],
      },
    };
    const ticks = parseCurrencyBatch(json, mapping, TS);
    expect(ticks).toHaveLength(2);
    const usd = ticks.find((t) => t.instrument === 'usdrub')!;
    const eur = ticks.find((t) => t.instrument === 'eurrub')!;
    expect(usd.value).toBe(91.25);
    expect(eur.value).toBe(102.5); // MARKETPRICE fallback
    expect(usd.ts).toEqual(TS);
    expect(usd.meta).toMatchObject({ source: 'moex-currency', secid: 'USD000UTSTOM' });
  });

  it('skips instruments with no numeric price', () => {
    const json = {
      marketdata: {
        columns: ['SECID', 'LAST', 'MARKETPRICE'],
        data: [['USD000UTSTOM', null, null]],
      },
    };
    const ticks = parseCurrencyBatch(json, mapping, TS);
    expect(ticks).toHaveLength(0);
  });

  it('tolerates malformed payloads', () => {
    expect(parseCurrencyBatch({}, mapping, TS)).toEqual([]);
    expect(parseCurrencyBatch(null, mapping, TS)).toEqual([]);
    expect(parseCurrencyBatch({ marketdata: { columns: 'x', data: 1 } }, mapping, TS)).toEqual(
      [],
    );
  });
});

describe('parseIndexQuote', () => {
  it('reads CURRENTVALUE with LAST fallback', () => {
    const json = {
      marketdata: {
        columns: ['SECID', 'CURRENTVALUE', 'LAST', 'TIME', 'SYSTIME'],
        data: [['IMOEX', 3050.4, 3049.9, '18:41:09', '2026-07-28 19:15:00']],
      },
    };
    const tick = parseIndexQuote(json, 'imoex', TS);
    expect(tick).not.toBeNull();
    expect(tick!.instrument).toBe('imoex');
    expect(tick!.value).toBe(3050.4);
    expect(tick!.ts).toEqual(TS);
  });

  it('returns null when no value', () => {
    const json = { marketdata: { columns: ['SECID', 'CURRENTVALUE'], data: [['IMOEX', null]] } };
    expect(parseIndexQuote(json, 'imoex', TS)).toBeNull();
  });
});

describe('parseFuturesBatch', () => {
  const assets = [
    { id: 'brent', assetCode: 'BR' },
    { id: 'wheat', assetCode: 'W4' },
  ];
  const today = new Date('2026-07-28T12:00:00+03:00');

  function board(): unknown {
    return {
      securities: {
        columns: ['SECID', 'ASSETCODE', 'LASTTRADEDATE'],
        data: [
          ['BR-8.26', 'BR', '2026-08-01'], // nearest future expiry
          ['BR-9.26', 'BR', '2026-09-01'],
          ['BR-7.26', 'BR', '2026-07-01'], // already expired
          ['W4-9.26', 'W4', '2026-09-01'],
        ],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'TIME', 'SYSTIME'],
        data: [
          ['BR-8.26', 68.5, '18:41:09', '2026-07-28 19:15:00'],
          ['BR-9.26', 69.0, '18:41:09', '2026-07-28 19:15:00'],
          ['W4-9.26', 5.5, '18:41:09', '2026-07-28 19:15:00'],
        ],
      },
    };
  }

  it('picks the nearest non-expired contract and its LAST price', () => {
    const ticks = parseFuturesBatch(board(), assets, today, TS);
    expect(ticks).toHaveLength(2);
    const brent = ticks.find((t) => t.instrument === 'brent')!;
    expect(brent.value).toBe(68.5); // BR-8.26 (nearest), not BR-9.26 or expired BR-7.26
    expect(brent.meta).toMatchObject({ assetCode: 'BR', secid: 'BR-8.26' });
    const wheat = ticks.find((t) => t.instrument === 'wheat')!;
    expect(wheat.value).toBe(5.5);
  });

  it('returns empty when securities block missing', () => {
    expect(parseFuturesBatch({}, assets, today, TS)).toEqual([]);
  });

  it('uses SETTLEPRICE instead of a zero LAST', () => {
    const json = {
      securities: {
        columns: ['SECID', 'ASSETCODE', 'LASTTRADEDATE'],
        data: [['SuV6', 'SUGAR', '2026-10-01']],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'SETTLEPRICE'],
        data: [['SuV6', 0, 71_000]],
      },
    };
    const ticks = parseFuturesBatch(json, [{ id: 'sugar', assetCode: 'SUGAR' }], today, TS);
    expect(ticks[0].value).toBe(71_000);
  });

  it('skips an unpriced front contract in favor of the next liquid one', () => {
    const json = {
      securities: {
        columns: ['SECID', 'ASSETCODE', 'LASTTRADEDATE'],
        data: [
          ['BR-near', 'BR', '2026-08-01'],
          ['BR-next', 'BR', '2026-09-01'],
        ],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'SETTLEPRICE'],
        data: [
          ['BR-near', 0, 0],
          ['BR-next', 69, 68.8],
        ],
      },
    };
    const ticks = parseFuturesBatch(json, [{ id: 'brent', assetCode: 'BR' }], today, TS);
    expect(ticks[0].value).toBe(69);
    expect(ticks[0].meta).toMatchObject({ secid: 'BR-next' });
  });
});

describe('parseBinancePrices', () => {
  const mapping = [
    { id: 'btc', symbol: 'BTCUSDT' },
    { id: 'eth', symbol: 'ETHUSDT' },
    { id: 'ton', symbol: 'TONUSDT' },
  ];

  it('parses the array form and maps symbol -> instrument', () => {
    const json = [
      { symbol: 'BTCUSDT', price: '119500.12' },
      { symbol: 'ETHUSDT', price: '3900.55' },
      { symbol: 'TONUSDT', price: '3.41' },
    ];
    const ticks = parseBinancePrices(json, mapping, TS);
    expect(ticks).toHaveLength(3);
    expect(ticks.find((t) => t.instrument === 'btc')!.value).toBeCloseTo(119500.12);
    expect(ticks.find((t) => t.instrument === 'eth')!.value).toBeCloseTo(3900.55);
    expect(ticks.find((t) => t.instrument === 'ton')!.value).toBeCloseTo(3.41);
    expect(ticks[0].ts).toEqual(TS);
    expect(ticks[0].meta).toMatchObject({ source: 'binance' });
  });

  it('skips missing / non-numeric symbols', () => {
    const json = [
      { symbol: 'BTCUSDT', price: '119500.12' },
      { symbol: 'ETHUSDT', price: 'not-a-number' },
    ];
    const ticks = parseBinancePrices(json, mapping, TS);
    expect(ticks.map((t) => t.instrument)).toEqual(['btc']);
  });

  it('tolerates non-array payloads', () => {
    expect(parseBinancePrices({}, mapping, TS)).toEqual([]);
    expect(parseBinancePrices(null, mapping, TS)).toEqual([]);
  });
});

describe('parseKrakenTicker', () => {
  const mapping = [{ id: 'ton', pair: 'TONUSD' }];

  it('maps an online pair last trade into a fresh Kraken tick', () => {
    const ticks = parseKrakenTicker({
      pair: 'TONUSD',
      status: 'online',
      ticker: { error: [], result: { TONUSD: { c: ['1.3780000', '83.77500'] } } },
    }, mapping, TS);

    expect(ticks).toEqual([{
      instrument: 'ton',
      ts: TS,
      value: 1.378,
      meta: { source: 'kraken', pair: 'TONUSD' },
    }]);
  });

  it('rejects a paused pair even when the REST ticker still has a last price', () => {
    expect(parseKrakenTicker({
      pair: 'TONUSD',
      status: 'cancel_only',
      ticker: { error: [], result: { TONUSD: { c: ['1.6000000', '1'] } } },
    }, mapping, TS)).toEqual([]);
  });
});
