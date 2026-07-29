import { describe, expect, it, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { RatesStore } from '../rates/rates.store';
import { RawQuote } from '../rates/quote.model';
import { DerivedEngine } from './derived.engine';
import { BREAKFAST_REFERENCES } from './derived.defs';

const NOW = new Date('2026-07-28T12:00:10+03:00');

function raw(over: Partial<RawQuote> & { instrumentId: string }): RawQuote {
  return {
    value: 100,
    time: new Date('2026-07-28T12:00:00+03:00'),
    systime: new Date('2026-07-28T12:00:05+03:00'),
    ...over,
  };
}

describe('DerivedEngine', () => {
  let store: RatesStore;
  let engine: DerivedEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RatesStore,
        DerivedEngine,
        { provide: LatestQuotesCacheService, useValue: { load: () => ({}), save: () => undefined } },
      ],
    });
    store = TestBed.inject(RatesStore);
    engine = TestBed.inject(DerivedEngine);
    engine.now = () => NOW;
  });

  function quoteOf(id: string) {
    return engine.derivedTicker().find((e) => e.instrument.id === id)?.quote;
  }

  function applyAll(entries: (Partial<RawQuote> & { instrumentId: string })[]) {
    store.apply(entries.map(raw), 'moex', NOW);
  }

  // ── eurusd ────────────────────────────────────────────────────────────

  it('eurusd = eurrub / usdrub', () => {
    applyAll([
      { instrumentId: 'usdrub', value: 80 },
      { instrumentId: 'eurrub', value: 88 },
    ]);
    expect(quoteOf('eurusd')?.value).toBeCloseTo(1.1, 4);
  });

  it('eurusd unavailable, если нет usdrub', () => {
    applyAll([{ instrumentId: 'eurrub', value: 88 }]);
    const q = quoteOf('eurusd');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── btcrub ────────────────────────────────────────────────────────────

  it('btcrub = btc × usdrub', () => {
    applyAll([
      { instrumentId: 'btc', value: 120000 },
      { instrumentId: 'usdrub', value: 80 },
    ]);
    expect(quoteOf('btcrub')?.value).toBeCloseTo(9_600_000, 0);
  });

  it('btcrub unavailable, если btc нет', () => {
    applyAll([{ instrumentId: 'usdrub', value: 80 }]);
    const q = quoteOf('btcrub');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── btcgold ───────────────────────────────────────────────────────────

  it('btcgold = btc × usdrub / gold (граммы золота за BTC)', () => {
    applyAll([
      { instrumentId: 'btc', value: 120000 },
      { instrumentId: 'usdrub', value: 80 },
      { instrumentId: 'gold', value: 8000 }, // ₽/г
    ]);
    // 120000 × 80 = 9_600_000 ₽; 9_600_000 / 8000 = 1200 г
    expect(quoteOf('btcgold')?.value).toBeCloseTo(1200, 2);
  });

  it('btcgold unavailable, если gold нет', () => {
    applyAll([
      { instrumentId: 'btc', value: 120000 },
      { instrumentId: 'usdrub', value: 80 },
    ]);
    const q = quoteOf('btcgold');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── btcoil ────────────────────────────────────────────────────────────

  it('btcoil = btc / brent (баррелей за BTC)', () => {
    applyAll([
      { instrumentId: 'btc', value: 120000 },
      { instrumentId: 'brent', value: 60 },
    ]);
    expect(quoteOf('btcoil')?.value).toBeCloseTo(2000, 0);
  });

  it('btcoil unavailable, если brent нет', () => {
    applyAll([{ instrumentId: 'btc', value: 120000 }]);
    const q = quoteOf('btcoil');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── breakfast ─────────────────────────────────────────────────────────

  it('breakfast = среднее нормализованных компонентов × 100', () => {
    const ref = BREAKFAST_REFERENCES;
    applyAll([
      { instrumentId: 'coffee', value: ref['coffee'] },   // 1.0
      { instrumentId: 'oj', value: ref['oj'] },           // 1.0
      { instrumentId: 'wheat', value: ref['wheat'] },     // 1.0
      { instrumentId: 'sugar', value: ref['sugar'] },     // 1.0
    ]);
    // mean(1,1,1,1) × 100 = 100
    expect(quoteOf('breakfast')?.value).toBeCloseTo(100, 0);
  });

  it('breakfast растёт пропорционально: +10 % к каждому компоненту = 110', () => {
    const ref = BREAKFAST_REFERENCES;
    applyAll([
      { instrumentId: 'coffee', value: ref['coffee'] * 1.1 },
      { instrumentId: 'oj', value: ref['oj'] * 1.1 },
      { instrumentId: 'wheat', value: ref['wheat'] * 1.1 },
      { instrumentId: 'sugar', value: ref['sugar'] * 1.1 },
    ]);
    expect(quoteOf('breakfast')?.value).toBeCloseTo(110, 0);
  });

  it('breakfast усредняет неравные отклонения', () => {
    const ref = BREAKFAST_REFERENCES;
    applyAll([
      { instrumentId: 'coffee', value: ref['coffee'] * 2 },   // 2.0
      { instrumentId: 'oj', value: ref['oj'] },               // 1.0
      { instrumentId: 'wheat', value: ref['wheat'] },         // 1.0
      { instrumentId: 'sugar', value: ref['sugar'] },         // 1.0
    ]);
    // mean(2,1,1,1) = 1.25 → 125
    expect(quoteOf('breakfast')?.value).toBeCloseTo(125, 0);
  });

  it('breakfast unavailable, если любого компонента нет', () => {
    const ref = BREAKFAST_REFERENCES;
    applyAll([
      { instrumentId: 'coffee', value: ref['coffee'] },
      { instrumentId: 'oj', value: ref['oj'] },
      { instrumentId: 'wheat', value: ref['wheat'] },
      // sugar отсутствует
    ]);
    const q = quoteOf('breakfast');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── rublgold ──────────────────────────────────────────────────────────

  it('rublgold = (1 / gold) × 1000 (мг золота за рубль)', () => {
    applyAll([{ instrumentId: 'gold', value: 8000 }]); // ₽/г
    // 1 / 8000 г = 0.000125 г = 0.125 мг
    expect(quoteOf('rublgold')?.value).toBeCloseTo(0.125, 3);
  });

  it('rublgold unavailable, если gold нет', () => {
    const q = quoteOf('rublgold');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── честность: unavailable вход → unavailable производная ────────────

  it('вход со статусом unavailable (value null) → производная unavailable, не 0', () => {
    applyAll([
      { instrumentId: 'usdrub', value: null },
      { instrumentId: 'eurrub', value: 88 },
    ]);
    const q = quoteOf('eurusd');
    expect(q?.status).toBe('unavailable');
    expect(q?.value).toBeNull();
  });

  // ── статус производной ────────────────────────────────────────────────

  it('статус live, когда все входы свежие в торговом окне', () => {
    applyAll([
      { instrumentId: 'usdrub', value: 80 },
      { instrumentId: 'eurrub', value: 88 },
    ]);
    expect(quoteOf('eurusd')?.status).toBe('live');
  });

  it('статус stale, если наихудший вход устарел', () => {
    applyAll([
      { instrumentId: 'usdrub', value: 80, systime: new Date('2026-07-28T11:00:00+03:00') },
      { instrumentId: 'eurrub', value: 88 },
    ]);
    expect(quoteOf('eurusd')?.status).toBe('stale');
  });

  it('статус closed, когда рынок производной закрыт', () => {
    const night = new Date('2026-07-28T00:45:00+03:00');
    engine.now = () => night;
    store.apply(
      [
        raw({ instrumentId: 'usdrub', value: 80, systime: new Date('2026-07-27T23:54:00+03:00') }),
        raw({ instrumentId: 'eurrub', value: 88, systime: new Date('2026-07-27T23:54:00+03:00') }),
      ],
      'moex',
      night,
    );
    expect(quoteOf('eurusd')?.status).toBe('closed');
  });

  // ── структура тикера ─────────────────────────────────────────────────

  it('derivedTicker содержит все 6 производных в порядке реестра', () => {
    const ids = engine.derivedTicker().map((e) => e.instrument.id);
    expect(ids).toEqual(['eurusd', 'btcrub', 'btcgold', 'btcoil', 'breakfast', 'rublgold']);
  });

  it('derivedTicker не содержит живых инструментов', () => {
    const ids = engine.derivedTicker().map((e) => e.instrument.id);
    expect(ids).not.toContain('usdrub');
    expect(ids).not.toContain('btc');
  });
});
