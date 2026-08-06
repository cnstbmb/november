import { describe, expect, it } from 'vitest';
import { parseBackendFallbackQuotes, parseBackendKrakenQuotes } from './backend-latest.parser';

describe('parseBackendKrakenQuotes', () => {
  it('accepts only Kraken-backed TON with a valid timestamp', () => {
    expect(
      parseBackendKrakenQuotes({
        ton: {
          ts: '2026-08-06T18:58:00.000Z',
          value: 1.378,
          meta: { source: 'kraken', pair: 'TONUSD' },
        },
        btc: {
          ts: '2026-08-06T18:58:00.000Z',
          value: 64000,
          meta: { source: 'binance', symbol: 'BTCUSDT' },
        },
      }),
    ).toEqual([
      {
        instrumentId: 'ton',
        value: 1.378,
        time: new Date('2026-08-06T18:58:00.000Z'),
        systime: new Date('2026-08-06T18:58:00.000Z'),
      },
    ]);
  });

  it('rejects the stale legacy Binance TON row', () => {
    expect(
      parseBackendKrakenQuotes({
        ton: {
          ts: '2026-08-06T18:58:00.000Z',
          value: 1.6,
          meta: { source: 'binance', symbol: 'TONUSDT' },
        },
      }),
    ).toEqual([]);
  });

  it('separates official CBR and Kraken fallback quotes', () => {
    expect(parseBackendFallbackQuotes({
      usdrub: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 80.25,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
      btc: {
        ts: '2026-08-06T18:58:25.000Z',
        value: 64_000,
        meta: { source: 'kraken', pair: 'BTCUSD' },
      },
      injected: {
        ts: '2026-08-06T18:58:25.000Z',
        value: 1,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
    })).toEqual({
      cbr: [{
        instrumentId: 'usdrub',
        value: 80.25,
        time: new Date('2026-08-06T18:58:00.000Z'),
        systime: new Date('2026-08-06T18:58:00.000Z'),
      }],
      kraken: [{
        instrumentId: 'btc',
        value: 64_000,
        time: new Date('2026-08-06T18:58:25.000Z'),
        systime: new Date('2026-08-06T18:58:25.000Z'),
      }],
    });
  });
});
