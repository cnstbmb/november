import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Quote } from '../rates/quote.model';
import {
  LATEST_QUOTES_CACHE_KEY,
  LATEST_QUOTES_CACHE_VERSION,
  LATEST_QUOTES_SAVE_DELAY_MS,
  LatestQuotesCacheService,
  OFFLINE_STORAGE,
} from './latest-quotes-cache.service';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  readonly getItem = vi.fn((key: string) => this.values.get(key) ?? null);
  readonly setItem = vi.fn((key: string, value: string) => this.values.set(key, value));
  readonly removeItem = vi.fn((key: string) => this.values.delete(key));
  readonly clear = vi.fn(() => this.values.clear());
  readonly key = vi.fn((index: number) => [...this.values.keys()][index] ?? null);
  get length(): number {
    return this.values.size;
  }
}

function quote(value: number): Quote {
  return {
    instrumentId: 'usdrub',
    value,
    time: new Date('2026-07-28T08:59:55.000Z'),
    systime: new Date('2026-07-28T09:00:00.000Z'),
    source: 'moex',
    status: 'live',
  };
}

describe('LatestQuotesCacheService', () => {
  let storage: MemoryStorage;
  let service: LatestQuotesCacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T09:00:10.000Z'));
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        LatestQuotesCacheService,
        { provide: OFFLINE_STORAGE, useValue: storage },
      ],
    });
    service = TestBed.inject(LatestQuotesCacheService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('coalesces rapid saves and persists only normalized latest quotes', () => {
    service.save([quote(78)]);
    service.save([quote(79)]);

    vi.advanceTimersByTime(LATEST_QUOTES_SAVE_DELAY_MS - 1);
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(storage.getItem(LATEST_QUOTES_CACHE_KEY)!);
    expect(payload.version).toBe(LATEST_QUOTES_CACHE_VERSION);
    expect(payload.quotes.usdrub).toEqual({
      value: 79,
      time: '2026-07-28T08:59:55.000Z',
      systime: '2026-07-28T09:00:00.000Z',
      receivedAt: '2026-07-28T09:00:00.000Z',
      source: 'moex',
    });
    expect(payload.quotes.usdrub.instrumentId).toBeUndefined();
    expect(payload.quotes.usdrub.status).toBeUndefined();
  });

  it('stores only available live instruments, never derived placeholders', () => {
    service.save([
      { ...quote(79), instrumentId: 'btcrub' },
      { ...quote(79), instrumentId: 'eurrub', value: null },
      quote(80),
    ]);
    vi.advanceTimersByTime(LATEST_QUOTES_SAVE_DELAY_MS);

    const payload = JSON.parse(storage.getItem(LATEST_QUOTES_CACHE_KEY)!);
    expect(Object.keys(payload.quotes)).toEqual(['usdrub']);
  });

  it('keeps the last valid value when a later snapshot contains null', () => {
    service.save([quote(80)]);
    vi.advanceTimersByTime(LATEST_QUOTES_SAVE_DELAY_MS);
    service.save([{ ...quote(80), value: null }]);
    vi.advanceTimersByTime(LATEST_QUOTES_SAVE_DELAY_MS);

    expect(service.load()['usdrub']?.value).toBe(80);
  });

  it('revives legacy cache and uses savedAt as the last successful response', () => {
    storage.setItem(LATEST_QUOTES_CACHE_KEY, JSON.stringify({
      version: LATEST_QUOTES_CACHE_VERSION,
      savedAt: '2026-07-28T08:00:00.000Z',
      quotes: {
        btc: {
          value: 65_000,
          time: '2026-07-28T08:00:00.000Z',
          systime: '2026-07-28T08:00:00.000Z',
          source: 'binance',
          status: 'live',
        },
      },
    }));

    const loaded = service.load(new Date('2026-07-28T09:00:10.000Z'));
    expect(loaded['btc']?.time).toBeInstanceOf(Date);
    expect(loaded['btc']?.systime?.toISOString()).toBe('2026-07-28T08:00:00.000Z');
    expect(loaded['btc']?.receivedAt?.toISOString()).toBe('2026-07-28T08:00:00.000Z');
    expect(loaded['btc']?.status).toBe('stale');
  });

  it('rejects incompatible versions and malformed quote entries', () => {
    storage.setItem(LATEST_QUOTES_CACHE_KEY, JSON.stringify({
      version: LATEST_QUOTES_CACHE_VERSION + 1,
      savedAt: '2026-07-28T09:00:00.000Z',
      quotes: { usdrub: { value: 78 } },
    }));
    expect(service.load()).toEqual({});

    storage.setItem(LATEST_QUOTES_CACHE_KEY, JSON.stringify({
      version: LATEST_QUOTES_CACHE_VERSION,
      savedAt: '2026-07-28T09:00:00.000Z',
      quotes: {
        usdrub: { value: 78, time: 'not-a-date', systime: null, source: 'moex' },
        unknown: { value: 1, time: null, systime: null, source: 'moex' },
      },
    }));
    expect(service.load()).toEqual({});
  });

  it('flushes a pending save on pagehide', () => {
    service.save([quote(80)]);
    window.dispatchEvent(new Event('pagehide'));

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LATEST_QUOTES_SAVE_DELAY_MS);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('never throws when storage reads or writes fail', () => {
    storage.getItem.mockImplementationOnce(() => {
      throw new DOMException('blocked');
    });
    expect(() => service.load()).not.toThrow();
    expect(service.load()).toEqual({});

    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException('quota');
    });
    service.save([quote(81)]);
    expect(() => vi.advanceTimersByTime(LATEST_QUOTES_SAVE_DELAY_MS)).not.toThrow();
  });
});
