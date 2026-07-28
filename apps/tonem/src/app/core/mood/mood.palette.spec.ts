import { describe, expect, it } from 'vitest';
import { HUE_FALLING, HUE_NEUTRAL, HUE_RISING, moodCssValues, moodHueDegrees } from './mood.palette';

describe('moodHueDegrees', () => {
  it('полюса: рост/нейтраль/падение', () => {
    expect(moodHueDegrees(1)).toBeCloseTo(HUE_RISING, 5);
    expect(moodHueDegrees(0)).toBeCloseTo(HUE_NEUTRAL, 5);
    expect(moodHueDegrees(-1)).toBeCloseTo(HUE_FALLING, 5);
  });

  it('монотонна: рост hue → сдвиг к тёплому (меньшие градусы)', () => {
    expect(moodHueDegrees(0.5)).toBeLessThan(moodHueDegrees(0));
    expect(moodHueDegrees(0)).toBeGreaterThan(moodHueDegrees(-0.5));
  });
});

describe('moodCssValues', () => {
  it('возвращает три строки в ожидаемых диапазонах', () => {
    const css = moodCssValues({ hue: 0.5, energy: 0.7, turbulence: 0.3 });
    expect(Number(css.hue)).toBeGreaterThanOrEqual(0);
    expect(Number(css.hue)).toBeLessThanOrEqual(360);
    expect(Number(css.energy)).toBeCloseTo(0.7, 3);
    expect(Number(css.turbulence)).toBeCloseTo(0.3, 3);
  });

  it('клиппит energy/turbulence к [0,1]', () => {
    const css = moodCssValues({ hue: 0, energy: 2, turbulence: -1 });
    expect(Number(css.energy)).toBe(1);
    expect(Number(css.turbulence)).toBe(0);
  });
});
