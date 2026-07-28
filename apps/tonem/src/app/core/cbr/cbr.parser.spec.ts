import { describe, expect, it } from 'vitest';
import cbrDaily from './__fixtures__/cbr-daily.json';
import { parseCbrDaily } from './cbr.parser';

describe('parseCbrDaily', () => {
  const mapping = [
    { id: 'usdrub', cbrCode: 'USD' },
    { id: 'eurrub', cbrCode: 'EUR' },
    { id: 'cnyrub', cbrCode: 'CNY' },
  ];

  it('достаёт курсы трёх валют', () => {
    const quotes = parseCbrDaily(cbrDaily, mapping);
    expect(quotes).toHaveLength(3);
    const usd = quotes.find((q) => q.instrumentId === 'usdrub');
    expect(usd?.value).toBeGreaterThan(50);
    expect(usd?.value).toBeLessThan(200);
  });

  it('делит на Nominal, если он не 1', () => {
    const quotes = parseCbrDaily(cbrDaily, mapping);
    const cny = quotes.find((q) => q.instrumentId === 'cnyrub');
    // CNY/RUB разумный порядок — 8..20, не сотни
    expect(cny?.value).toBeGreaterThan(5);
    expect(cny?.value).toBeLessThan(30);
  });

  it('проставляет время из Date/Timestamp ответа', () => {
    const quotes = parseCbrDaily(cbrDaily, mapping);
    expect(quotes[0].systime?.toISOString()).toBe('2026-07-28T17:00:00.000Z');
  });

  it('неизвестный код валюты → value null', () => {
    const quotes = parseCbrDaily(cbrDaily, [{ id: 'x', cbrCode: 'XXX' }]);
    expect(quotes[0].value).toBeNull();
  });
});
