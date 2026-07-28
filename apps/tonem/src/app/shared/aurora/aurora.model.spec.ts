import { describe, expect, it } from 'vitest';
import { auroraFrame, auroraPrimaryHue, auroraSecondaryHue } from './aurora.model';

describe('auroraPrimaryHue', () => {
  it('рост → тёплый (малые градусы), падение → холодный (~215°)', () => {
    expect(auroraPrimaryHue(1)).toBeLessThan(90); // янтарная зона
    expect(auroraPrimaryHue(-1)).toBeCloseTo(215, 1);
    expect(auroraPrimaryHue(0)).toBeCloseTo(230, 1);
  });
});

describe('auroraSecondaryHue', () => {
  it('в диапазоне [0,360)', () => {
    for (const h of [-1, -0.5, 0, 0.5, 1]) {
      const p = auroraPrimaryHue(h);
      const s = auroraSecondaryHue(p, h);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(360);
    }
  });

  it('при росте secondary холоднее primary, при падении — теплее', () => {
    const up = auroraPrimaryHue(1);
    expect(auroraSecondaryHue(up, 1)).toBe((up - 60 + 360) % 360);
    const down = auroraPrimaryHue(-1);
    expect(auroraSecondaryHue(down, -1)).toBe((down + 60) % 360);
  });
});

describe('auroraFrame', () => {
  it('энергия повышает скорость течения и альфу', () => {
    const calm = auroraFrame({ hue: 0, energy: 0, turbulence: 0 });
    const active = auroraFrame({ hue: 0, energy: 1, turbulence: 0 });
    expect(active.flowSpeed).toBeGreaterThan(calm.flowSpeed);
    expect(active.alpha).toBeGreaterThan(calm.alpha);
  });

  it('турбулентность повышает jitter', () => {
    const smooth = auroraFrame({ hue: 0, energy: 0, turbulence: 0 });
    const stormy = auroraFrame({ hue: 0, energy: 0, turbulence: 1 });
    expect(stormy.jitter).toBeGreaterThan(smooth.jitter);
  });

  it('параметры клиппятся к допустимым диапазонам', () => {
    const f = auroraFrame({ hue: 0, energy: 5, turbulence: 5 });
    expect(f.alpha).toBeLessThanOrEqual(1);
    expect(f.jitter).toBeLessThanOrEqual(1);
  });
});
