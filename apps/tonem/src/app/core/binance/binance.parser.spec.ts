import { describe, expect, it } from 'vitest';
import btcTicker from './__fixtures__/mini-ticker-btc.json';
import { parseCombinedMessage, parseMiniTicker } from './binance.parser';

const symbolToId = new Map([
  ['BTCUSDT', 'btc'],
  ['ETHUSDT', 'eth'],
  ['TONUSDT', 'ton'],
]);

describe('parseMiniTicker', () => {
  it('достаёт close-цену и event time из miniTicker', () => {
    const quotes = parseMiniTicker(btcTicker.data, symbolToId);
    expect(quotes).toHaveLength(1);
    const q = quotes[0];
    expect(q.instrumentId).toBe('btc');
    expect(q.value).toBeCloseTo(65123.45, 2);
    expect(q.systime?.toISOString()).toBe('2026-07-28T12:00:00.000Z');
    expect(q.time?.toISOString()).toBe('2026-07-28T12:00:00.000Z');
  });

  it('неизвестный символ → пустой массив', () => {
    expect(parseMiniTicker({ s: 'DOGEUSDT', c: '0.1', E: 1 }, symbolToId)).toEqual([]);
  });

  it('нечисловая цена → value null, но котировка есть', () => {
    const quotes = parseMiniTicker({ s: 'BTCUSDT', c: 'abc', E: 1785240000000 }, symbolToId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].value).toBeNull();
    expect(quotes[0].systime).not.toBeNull();
  });

  it('без event time → time/systime null', () => {
    const quotes = parseMiniTicker({ s: 'BTCUSDT', c: '100' }, symbolToId);
    expect(quotes[0].value).toBe(100);
    expect(quotes[0].systime).toBeNull();
  });
});

describe('parseCombinedMessage', () => {
  it('разбирает готовый объект-обёртку {stream,data}', () => {
    const quotes = parseCombinedMessage(btcTicker, symbolToId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].instrumentId).toBe('btc');
  });

  it('разбирает сырой WS-кадр строкой (JSON)', () => {
    const quotes = parseCombinedMessage(JSON.stringify(btcTicker), symbolToId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].value).toBeCloseTo(65123.45, 2);
  });

  it('битый JSON → пустой массив, без исключения', () => {
    expect(parseCombinedMessage('{not json', symbolToId)).toEqual([]);
  });

  it('кадр без data → пустой массив', () => {
    expect(parseCombinedMessage({ stream: 'btcusdt@miniTicker' }, symbolToId)).toEqual([]);
  });

  it('не-объект → пустой массив', () => {
    expect(parseCombinedMessage(null, symbolToId)).toEqual([]);
    expect(parseCombinedMessage(42, symbolToId)).toEqual([]);
  });
});
