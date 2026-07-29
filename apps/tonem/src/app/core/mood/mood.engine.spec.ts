import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { RatesStore } from '../rates/rates.store';
import { RawQuote } from '../rates/quote.model';
import { MoodEngine } from './mood.engine';
import { MOOD_EMA_ALPHA, MOOD_TICK_MS } from './mood.model';
import { MOOD_VAR_ENERGY, MOOD_VAR_HUE, MOOD_VAR_TURBULENCE } from './mood.palette';

const NOW = new Date('2026-07-28T12:00:10+03:00');

const raw = (over: Partial<RawQuote>): RawQuote => ({
  instrumentId: 'usdrub',
  value: 100,
  time: new Date('2026-07-28T12:00:00+03:00'),
  systime: new Date('2026-07-28T12:00:05+03:00'),
  ...over,
});

/** Применяет котировки к стору: массив [instrumentId, value]. */
function applyQuotes(store: RatesStore, quotes: ReadonlyArray<readonly [string, number]>): void {
  store.apply(
    quotes.map(([instrumentId, value]) => raw({ instrumentId, value })),
    'moex',
    NOW,
  );
}

describe('MoodEngine', () => {
  let store: RatesStore;
  let engine: MoodEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RatesStore,
        { provide: LatestQuotesCacheService, useValue: { load: () => ({}), save: () => undefined } },
      ],
    });
    store = TestBed.inject(RatesStore);
  });

  afterEach(() => {
    engine?.stop();
    vi.useRealTimers();
    document.documentElement.style.cssText = '';
  });

  function createEngine(): MoodEngine {
    engine = TestBed.runInInjectionContext(() => new MoodEngine());
    return engine;
  }

  it('без данных — нейтральное настроение', () => {
    createEngine();
    expect(engine.hue()).toBe(0);
    expect(engine.energy()).toBe(0);
    expect(engine.turbulence()).toBe(0);
  });

  it('рост после baseline → hue становится положительным (сглажено)', () => {
    applyQuotes(store, [
      ['usdrub', 100],
      ['eurrub', 100],
      ['imoex', 100],
    ]);
    createEngine(); // фиксирует baseline = 100

    applyQuotes(store, [
      ['usdrub', 102],
      ['eurrub', 102],
      ['imoex', 102],
    ]);
    engine.tick(1); // alpha=1 — мгновенно к цели для проверки знака
    expect(engine.hue()).toBeGreaterThan(0);
  });

  it('падение после baseline → отрицательный hue', () => {
    applyQuotes(store, [
      ['usdrub', 100],
      ['eurrub', 100],
    ]);
    createEngine();

    applyQuotes(store, [
      ['usdrub', 98],
      ['eurrub', 98],
    ]);
    engine.tick(1);
    expect(engine.hue()).toBeLessThan(0);
  });

  it('baseline берётся из первого значения, не из текущего', () => {
    applyQuotes(store, [['usdrub', 100]]);
    createEngine();
    applyQuotes(store, [['usdrub', 150]]); // резкий рост
    engine.tick(1);
    expect(engine.hue()).toBeGreaterThan(0);
  });

  it('EMA сглаживает: после первого тика значение меньше целевого', () => {
    applyQuotes(store, [['usdrub', 100]]);
    createEngine();
    applyQuotes(store, [['usdrub', 104]]); // сильный рост

    engine.tick(MOOD_EMA_ALPHA);
    const afterOne = engine.hue();
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne).toBeLessThan(0.5); // далеко от насыщения — сглажено
  });

  it('тик с реальным alpha сходится к цели за много шагов', () => {
    applyQuotes(store, [['usdrub', 100]]);
    createEngine();
    applyQuotes(store, [['usdrub', 102]]);

    for (let i = 0; i < 300; i++) engine.tick(MOOD_EMA_ALPHA);
    expect(engine.hue()).toBeGreaterThan(0.9); // сошлось к tanh(5)≈0.999
  });

  it('пишет CSS-переменные на :root при обновлении настроения', () => {
    applyQuotes(store, [['usdrub', 100]]);
    createEngine();
    applyQuotes(store, [['usdrub', 103]]);
    engine.tick(1);
    TestBed.tick(); // прогоняем эффекты

    const style = document.documentElement.style;
    expect(style.getPropertyValue(MOOD_VAR_HUE)).not.toBe('');
    expect(style.getPropertyValue(MOOD_VAR_ENERGY)).not.toBe('');
    expect(style.getPropertyValue(MOOD_VAR_TURBULENCE)).not.toBe('');
  });

  it('интервал запускается автоматически и останавливается stop()', () => {
    vi.useFakeTimers();
    createEngine();
    const spy = vi.spyOn(engine as unknown as { tick: () => void }, 'tick');
    vi.advanceTimersByTime(MOOD_TICK_MS * 3);
    expect(spy).toHaveBeenCalledTimes(3);

    engine.stop();
    vi.advanceTimersByTime(MOOD_TICK_MS * 3);
    expect(spy).toHaveBeenCalledTimes(3); // больше не тикает
  });
});
