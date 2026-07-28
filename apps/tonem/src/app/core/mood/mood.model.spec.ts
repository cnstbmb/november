import { describe, expect, it } from 'vitest';
import {
  MOOD_EMA_ALPHA,
  MarketMood,
  MoodSample,
  aggregateMood,
  clamp01,
  deltaPct,
  ema,
  moodHueDegrees,
  neutralMood,
  normalizeDelta,
  smoothMood,
} from './index';

const sample = (id: string, baseline: number, current: number): MoodSample => ({
  id,
  baseline,
  current,
});

describe('deltaPct', () => {
  it('считает процентную дельту относительно baseline', () => {
    expect(deltaPct(sample('x', 100, 104))).toBeCloseTo(0.04, 6);
    expect(deltaPct(sample('x', 100, 96))).toBeCloseTo(-0.04, 6);
  });

  it('baseline <= 0 → 0 (защита от деления на ноль)', () => {
    expect(deltaPct(sample('x', 0, 100))).toBe(0);
    expect(deltaPct(sample('x', -5, 100))).toBe(0);
  });
});

describe('normalizeDelta', () => {
  it('0 → 0, знак сохраняется', () => {
    expect(normalizeDelta(0)).toBe(0);
    expect(normalizeDelta(0.01)).toBeGreaterThan(0);
    expect(normalizeDelta(-0.01)).toBeLessThan(0);
  });

  it('насыщается к ±1 без превышения', () => {
    expect(normalizeDelta(10)).toBeLessThanOrEqual(1);
    expect(normalizeDelta(-10)).toBeGreaterThanOrEqual(-1);
    expect(normalizeDelta(0.004)).toBeCloseTo(Math.tanh(1), 6); // 0.4% → 1σ
  });
});

describe('aggregateMood', () => {
  it('единый рост → положительный hue, нулевая турбулентность', () => {
    const mood = aggregateMood([
      sample('a', 100, 101),
      sample('b', 100, 101),
      sample('c', 100, 101),
    ]);
    expect(mood.hue).toBeGreaterThan(0);
    expect(mood.turbulence).toBeCloseTo(0, 10); // одинаковые дельты → без разброса
    expect(mood.energy).toBeGreaterThan(0);
  });

  it('единое падение → отрицательный hue', () => {
    const mood = aggregateMood([sample('a', 100, 99), sample('b', 100, 98)]);
    expect(mood.hue).toBeLessThan(0);
  });

  it('расходящиеся движения → высокая турбулентность', () => {
    const calm = aggregateMood([sample('a', 100, 101), sample('b', 100, 101)]);
    const stormy = aggregateMood([sample('a', 100, 103), sample('b', 100, 97)]);
    expect(stormy.turbulence).toBeGreaterThan(calm.turbulence);
  });

  it('энергия масштабируется величиной движения', () => {
    const small = aggregateMood([sample('a', 100, 100.2), sample('b', 100, 100.1)]);
    const big = aggregateMood([sample('a', 100, 103), sample('b', 100, 104)]);
    expect(big.energy).toBeGreaterThan(small.energy);
  });

  it('пустой набор → нейтраль (0,0,0)', () => {
    const mood = aggregateMood([]);
    expect(mood).toEqual({ hue: 0, energy: 0, turbulence: 0 });
  });
});

describe('moodHueDegrees', () => {
  it('рост (hue>0) → тёплая сторона (янтарь ~35°)', () => {
    expect(moodHueDegrees(1)).toBeCloseTo(35, 1);
    expect(moodHueDegrees(0.5)).toBeLessThan(230);
  });

  it('падение (hue<0) → холодная сторона (синий ~215°)', () => {
    expect(moodHueDegrees(-1)).toBeCloseTo(215, 1);
  });

  it('нейтраль (0) → ~230° (серо-синий)', () => {
    expect(moodHueDegrees(0)).toBeCloseTo(230, 1);
  });
});

describe('ema', () => {
  it('шаг к цели не превышает alpha * |target - current|', () => {
    const alpha = 0.06;
    const step = Math.abs(ema(0, 1, alpha) - 0);
    expect(step).toBeLessThanOrEqual(alpha);
  });

  it('alpha = 1 → мгновенно к цели', () => {
    expect(ema(0.2, 0.9, 1)).toBeCloseTo(0.9, 9);
  });
});

describe('smoothMood — сходимость EMA', () => {
  const target: MarketMood = { hue: 0.8, energy: 0.6, turbulence: 0.4 };

  it('за повторные шаги приближается к цели', () => {
    let mood = neutralMood();
    for (let i = 0; i < 200; i++) mood = smoothMood(mood, target, MOOD_EMA_ALPHA);
    expect(mood.hue).toBeCloseTo(target.hue, 2);
    expect(mood.energy).toBeCloseTo(target.energy, 2);
    expect(mood.turbulence).toBeCloseTo(target.turbulence, 2);
  });

  it('никогда не делает скачка больше alpha за шаг', () => {
    let mood = neutralMood();
    for (let i = 0; i < 50; i++) {
      const next = smoothMood(mood, target, MOOD_EMA_ALPHA);
      expect(Math.abs(next.hue - mood.hue)).toBeLessThanOrEqual(MOOD_EMA_ALPHA);
      mood = next;
    }
  });

  it('монотонно приближается: каждый шаг не дальше цели, чем предыдущий', () => {
    let mood = neutralMood();
    let prevDist = Math.abs(target.hue - mood.hue);
    for (let i = 0; i < 30; i++) {
      mood = smoothMood(mood, target, MOOD_EMA_ALPHA);
      const dist = Math.abs(target.hue - mood.hue);
      expect(dist).toBeLessThanOrEqual(prevDist + 1e-12);
      prevDist = dist;
    }
  });
});

describe('clamp01', () => {
  it('ограничивает [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
  });
});
