import { TestBed } from '@angular/core/testing';
import { RatesStore } from './rates.store';
import { RawQuote } from './quote.model';
import { INSTRUMENTS } from '../instruments/instrument.registry';

const raw = (over: Partial<RawQuote>): RawQuote => ({
  instrumentId: 'usdrub',
  value: 78.58,
  time: new Date('2026-07-28T12:00:00+03:00'),
  systime: new Date('2026-07-28T12:00:05+03:00'),
  ...over,
});

describe('RatesStore', () => {
  let store: RatesStore;
  const now = new Date('2026-07-28T12:00:10+03:00');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [RatesStore] });
    store = TestBed.inject(RatesStore);
  });

  it('до загрузки hero — unavailable', () => {
    expect(store.hero().quote.status).toBe('unavailable');
    expect(store.hero().quote.value).toBeNull();
  });

  it('ticker содержит все инструменты реестра', () => {
    expect(store.ticker().length).toBe(INSTRUMENTS.length);
    expect(store.ticker()[0].instrument.id).toBe('usdrub');
  });

  it('apply обновляет hero и вычисляет live-статус', () => {
    store.apply([raw({})], 'moex', now);
    expect(store.hero().quote.value).toBeCloseTo(78.58, 2);
    expect(store.hero().quote.status).toBe('live');
  });

  it('ночью статус closed', () => {
    const night = new Date('2026-07-28T00:45:00+03:00');
    store.apply([raw({ systime: new Date('2026-07-27T23:54:00+03:00') })], 'moex', night);
    expect(store.hero().quote.status).toBe('closed');
  });

  it('источник cbr сохраняется в котировке', () => {
    store.apply([raw({})], 'cbr', now);
    expect(store.hero().quote.source).toBe('cbr');
  });

  it('неизвестный instrumentId игнорируется', () => {
    store.apply([raw({ instrumentId: 'dogecoin' })], 'moex', now);
    expect(store.hero().quote.status).toBe('unavailable');
  });
});
