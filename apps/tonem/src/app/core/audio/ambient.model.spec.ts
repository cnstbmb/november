import { describe, expect, it } from 'vitest';
import { moodToAmbientScene, nextAmbientDelay, nextAmbientFrequency, volumeToGain } from './ambient.model';

const mood = (hue: number, energy = 0.5, turbulence = 0.2) => ({ hue, energy, turbulence });

describe('ambient model', () => {
  it('делает растущий рынок светлее и быстрее падающего', () => {
    const rising = moodToAmbientScene(mood(1));
    const falling = moodToAmbientScene(mood(-1));
    expect(rising.brightnessHz).toBeGreaterThan(falling.brightnessHz);
    expect(rising.noteIntervalMaxMs).toBeLessThan(falling.noteIntervalMaxMs);
    expect(rising.scale).not.toEqual(falling.scale);
  });

  it('генерация детерминируется переданным random и остаётся в сцене', () => {
    const scene = moodToAmbientScene(mood(0));
    expect(nextAmbientDelay(scene, () => 0)).toBe(Math.round(scene.noteIntervalMinMs));
    expect(nextAmbientDelay(scene, () => 1)).toBe(Math.round(scene.noteIntervalMaxMs));
    expect(nextAmbientFrequency(scene, () => 0)).toBeCloseTo(scene.rootHz, 5);
  });

  it('громкость нелинейна и ограничена безопасным максимумом', () => {
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(0.5)).toBeCloseTo(0.105, 5);
    expect(volumeToGain(4)).toBeCloseTo(0.42, 5);
  });
});
