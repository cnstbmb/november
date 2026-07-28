import { describe, expect, it } from 'vitest';
import currencyBatch from './__fixtures__/currency-batch.json';
import imoexJson from './__fixtures__/imoex.json';
import fortsBatch from './__fixtures__/forts-batch.json';
import {
  parseCurrencyBatch,
  parseFuturesBatch,
  parseIndexQuote,
} from './moex-iss.parser';

describe('parseCurrencyBatch', () => {
  const mapping = [
    { id: 'usdrub', secid: 'USD000UTSTOM' },
    { id: 'eurrub', secid: 'EUR_RUB__TOM' },
    { id: 'cnyrub', secid: 'CNYRUB_TOM' },
    { id: 'gold', secid: 'GLDRUB_TOM' },
  ];

  it('достаёт LAST и времена для USD/RUB', () => {
    const quotes = parseCurrencyBatch(currencyBatch, mapping);
    const usd = quotes.find((q) => q.instrumentId === 'usdrub');
    expect(usd?.value).toBeCloseTo(79.485, 3);
    expect(usd?.systime?.toISOString()).toBe('2026-07-28T19:23:49.000Z');
  });

  it('для EUR/RUB берёт MARKETPRICE, когда LAST = null', () => {
    const quotes = parseCurrencyBatch(currencyBatch, mapping);
    const eur = quotes.find((q) => q.instrumentId === 'eurrub');
    expect(eur?.value).toBeCloseTo(88.7602, 4);
  });

  it('LAST предпочтительнее MARKETPRICE (USD берёт LAST)', () => {
    const quotes = parseCurrencyBatch(currencyBatch, mapping);
    const usd = quotes.find((q) => q.instrumentId === 'usdrub');
    // в фикстуре LAST=79.485, MARKETPRICE=78.0172
    expect(usd?.value).toBeCloseTo(79.485, 3);
  });

  it('возвращает котировки для всех инструментов маппинга', () => {
    const quotes = parseCurrencyBatch(currencyBatch, mapping);
    expect(quotes.map((q) => q.instrumentId).sort()).toEqual(
      ['cnyrub', 'eurrub', 'gold', 'usdrub'].sort(),
    );
  });

  it('кривой ответ (без columns/data) не роняет парсер', () => {
    const quotes = parseCurrencyBatch({ marketdata: null }, mapping);
    expect(quotes).toHaveLength(4);
    expect(quotes.every((q) => q.value === null)).toBe(true);
  });
});

describe('parseIndexQuote', () => {
  it('достаёт CURRENTVALUE для IMOEX', () => {
    const q = parseIndexQuote(imoexJson, 'imoex');
    expect(q.value).toBeCloseTo(2191.18, 2);
    expect(q.systime?.toISOString()).toBe('2026-07-28T16:00:11.000Z');
  });
});

describe('parseFuturesBatch', () => {
  const today = new Date('2026-07-28T12:00:00+03:00');

  it('выбирает ближайший контракт BR с ценой', () => {
    const quotes = parseFuturesBatch(fortsBatch, [{ id: 'brent', assetCode: 'BR' }], today);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].instrumentId).toBe('brent');
    expect(quotes[0].value).not.toBeNull();
  });

  it('игнорирует чужие asset-коды', () => {
    const quotes = parseFuturesBatch(fortsBatch, [{ id: 'brent', assetCode: 'BR' }], today);
    const secids = quotes.map((q) => q.instrumentId);
    expect(secids).not.toContain('wheat');
  });

  it('нет подходящего контракта — value null, не падает', () => {
    const quotes = parseFuturesBatch(
      { securities: { columns: fortsBatch.securities.columns, data: [] }, marketdata: fortsBatch.marketdata },
      [{ id: 'brent', assetCode: 'BR' }],
      today,
    );
    expect(quotes[0].value).toBeNull();
  });
});
