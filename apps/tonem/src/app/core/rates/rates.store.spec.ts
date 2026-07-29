import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RatesStore } from './rates.store';
import { Quote, RawQuote } from './quote.model';
import { INSTRUMENTS } from '../instruments/instrument.registry';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';

const raw = (over: Partial<RawQuote>): RawQuote => ({
  instrumentId: 'usdrub',
  value: 78.58,
  time: new Date('2026-07-28T12:00:00+03:00'),
  systime: new Date('2026-07-28T12:00:05+03:00'),
  ...over,
});

describe('RatesStore', () => {
  let store: RatesStore;
  let cache: { load: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  const now = new Date('2026-07-28T12:00:10+03:00');

  beforeEach(() => {
    cache = { load: vi.fn(() => ({})), save: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        RatesStore,
        { provide: LatestQuotesCacheService, useValue: cache },
      ],
    });
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

  it('после apply передаёт в офлайн-кэш полный объединённый снимок', () => {
    store.apply([raw({ instrumentId: 'usdrub' })], 'moex', now);
    store.apply([raw({ instrumentId: 'eurrub', value: 85 })], 'moex', now);

    const snapshot = cache.save.mock.calls.at(-1)?.[0] as Readonly<Record<string, Quote>>;
    expect(snapshot['usdrub']?.value).toBe(78.58);
    expect(snapshot['eurrub']?.value).toBe(85);
  });

  it('неизвестный instrumentId игнорируется', () => {
    store.apply([raw({ instrumentId: 'dogecoin' })], 'moex', now);
    expect(store.hero().quote.status).toBe('unavailable');
  });
});
