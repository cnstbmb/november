import { describe, expect, it } from 'vitest';
import { parseKrakenOhlc } from './kraken-ohlc.parser';

describe('parseKrakenOhlc', () => {
  it('normalizes Kraken OHLC rows', () => {
    const candles = parseKrakenOhlc({
      error: [],
      result: {
        TONUSD: [[1786039200, '1.386', '1.390', '1.376', '1.378', '1.379', '8679', 80]],
        last: 1786039200,
      },
    });
    expect(candles).toEqual([
      {
        ts: new Date(1786039200 * 1000),
        open: 1.386,
        high: 1.39,
        low: 1.376,
        close: 1.378,
      },
    ]);
  });
});
