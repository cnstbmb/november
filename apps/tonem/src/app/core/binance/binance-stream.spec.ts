import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKOFF_MAX_MS,
  backoffDelayMs,
  binanceMapping,
  coalesceLatestPerKey,
  combinedStreamUrl,
  symbolToIdMap,
} from './binance-stream';

describe('binanceMapping / combinedStreamUrl', () => {
  it('не включает исторические Binance-пары, когда live идёт из Kraken', () => {
    expect(binanceMapping()).toEqual([]);
    const mapping = [
      { id: 'btc', symbol: 'BTCUSDT' },
      { id: 'eth', symbol: 'ETHUSDT' },
    ];
    expect(combinedStreamUrl(mapping)).toBe(
      'wss://stream.binance.com:9443/stream?streams=' +
        'btcusdt@miniTicker/ethusdt@miniTicker',
    );
  });

  it('symbolToIdMap маппит символ на id инструмента', () => {
    const map = symbolToIdMap([
      { id: 'btc', symbol: 'BTCUSDT' },
      { id: 'eth', symbol: 'ETHUSDT' },
    ]);
    expect(map.get('BTCUSDT')).toBe('btc');
    expect(map.get('TONUSDT')).toBeUndefined();
    expect(map.get('DOGEUSDT')).toBeUndefined();
  });
});

describe('backoffDelayMs', () => {
  it('экспонента 1с → 2с → 4с → 8с → 16с', () => {
    expect(backoffDelayMs(1)).toBe(1_000);
    expect(backoffDelayMs(2)).toBe(2_000);
    expect(backoffDelayMs(3)).toBe(4_000);
    expect(backoffDelayMs(4)).toBe(8_000);
    expect(backoffDelayMs(5)).toBe(16_000);
  });

  it('ограничена потолком 30с', () => {
    expect(backoffDelayMs(6)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelayMs(20)).toBe(BACKOFF_MAX_MS);
  });
});

describe('coalesceLatestPerKey', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const collect = <T>(source$: Subject<T>, key: (t: T) => string) => {
    const out: T[][] = [];
    source$.pipe(coalesceLatestPerKey(500, key)).subscribe((batch) => out.push(batch));
    return out;
  };

  it('склеивает всплеск одного символа: latest wins, одна эмиссия за окно', () => {
    const src = new Subject<number>();
    const out = collect(src, () => 'btc');

    src.next(1);
    src.next(2);
    src.next(3);
    expect(out).toHaveLength(0); // ничего не ушло до конца окна

    vi.advanceTimersByTime(500);
    expect(out).toEqual([[3]]); // только последнее значение
  });

  it('разные символы в одном окне → по одному (последнему) на каждый', () => {
    const src = new Subject<{ s: string; v: number }>();
    const out = collect(src, (x) => x.s);

    src.next({ s: 'btc', v: 1 });
    src.next({ s: 'eth', v: 10 });
    src.next({ s: 'btc', v: 2 }); // перекрывает первый btc
    vi.advanceTimersByTime(500);

    expect(out).toHaveLength(1);
    const batch = out[0];
    expect(batch).toContainEqual({ s: 'btc', v: 2 });
    expect(batch).toContainEqual({ s: 'eth', v: 10 });
    expect(batch).toHaveLength(2);
  });

  it('экономит эмиссии: два окна → две пачки, а не на каждый тик', () => {
    const src = new Subject<number>();
    const out = collect(src, () => 'btc');

    src.next(1);
    vi.advanceTimersByTime(500); // окно 1 → [1]
    src.next(2);
    vi.advanceTimersByTime(500); // окно 2 → [2]

    expect(out).toEqual([[1], [2]]);
  });

  it('пустое окно не эмитит', () => {
    const src = new Subject<number>();
    const out = collect(src, () => 'btc');
    vi.advanceTimersByTime(2000);
    expect(out).toHaveLength(0);
  });
});
