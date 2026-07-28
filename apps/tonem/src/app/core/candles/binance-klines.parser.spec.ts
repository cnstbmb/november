import { describe, expect, it } from 'vitest';
import { parseBinanceKlines } from './binance-klines.parser';
import fixture from './__fixtures__/binance-klines-btc.json';

describe('parseBinanceKlines', () => {
  it('разбирает klines в Candle[] (close — строка, ts — ms epoch)', () => {
    const candles = parseBinanceKlines(fixture);
    expect(candles).toHaveLength(3);
    const first = candles[0];
    expect(first.close).toBeCloseTo(65050.5, 2);
    expect(first.open).toBeCloseTo(65000, 2);
    expect(first.high).toBeCloseTo(65100, 2);
    expect(first.low).toBeCloseTo(64900, 2);
    expect(first.ts.toISOString()).toBe('2026-07-28T12:00:00.000Z');
  });

  it('не-массив → пустой массив', () => {
    expect(parseBinanceKlines(null)).toEqual([]);
    expect(parseBinanceKlines({})).toEqual([]);
    expect(parseBinanceKlines('x')).toEqual([]);
  });

  it('пропускает свечи без валидного close/openTime', () => {
    const candles = parseBinanceKlines([
      [1785240000000, '1', '2', '0.5', '1.5'],
      ['bad', '1', '2', '0.5', '1.5'],
      [1785240300000, '1', '2', '0.5', 'abc'],
    ]);
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(1.5);
  });
});
