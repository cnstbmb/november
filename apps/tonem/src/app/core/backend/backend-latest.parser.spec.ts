import { describe, expect, it } from 'vitest';
import { parseBackendKrakenQuotes } from './backend-latest.parser';

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
});
