import { describe, expect, it } from 'vitest';
import { parseMoexCandles } from './moex-candles.parser';
import fixture from './__fixtures__/moex-candles-usdrub.json';

describe('parseMoexCandles', () => {
  it('разбирает candles.json в Candle[] с МСК-временем', () => {
    const candles = parseMoexCandles(fixture);
    expect(candles).toHaveLength(4);
    const first = candles[0];
    expect(first.close).toBeCloseTo(79.25, 2);
    expect(first.open).toBeCloseTo(79.1, 2);
    expect(first.high).toBeCloseTo(79.3, 2);
    expect(first.low).toBeCloseTo(79.05, 2);
    // "2026-07-28 10:00:00" МСК = 07:00 UTC
    expect(first.ts.toISOString()).toBe('2026-07-28T07:00:00.000Z');
  });

  it('битый ответ → пустой массив, без исключения', () => {
    expect(parseMoexCandles(null)).toEqual([]);
    expect(parseMoexCandles({})).toEqual([]);
    expect(parseMoexCandles({ candles: { columns: [], data: 'x' } })).toEqual([]);
  });

  it('пропускает строки без валидного close/begin', () => {
    const json = {
      candles: {
        columns: ['open', 'close', 'high', 'low', 'begin'],
        data: [
          [1, 2, 3, 0.5, '2026-07-28 10:00:00'],
          [1, 'bad', 3, 0.5, '2026-07-28 10:10:00'],
          [1, 4, 3, 0.5, null],
        ],
      },
    };
    const candles = parseMoexCandles(json);
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(2);
  });
});
