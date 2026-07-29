import { SmoothedMood } from '../mood/mood.model';

export interface AmbientScene {
  readonly rootHz: number;
  readonly chordRatio: number;
  readonly brightnessHz: number;
  readonly droneGain: number;
  readonly noteGain: number;
  readonly noteIntervalMinMs: number;
  readonly noteIntervalMaxMs: number;
  readonly scale: readonly number[];
}

const BRIGHT_SCALE = [0, 2, 4, 7, 9] as const;
const DARK_SCALE = [0, 2, 3, 7, 8] as const;

export function moodToAmbientScene(mood: SmoothedMood): AmbientScene {
  const hue = clamp(mood.hue, -1, 1);
  const energy = clamp(mood.energy, 0, 1);
  const turbulence = clamp(mood.turbulence, 0, 1);
  const positive = (hue + 1) / 2;

  return {
    rootHz: 48 + positive * 18,
    chordRatio: positive >= 0.5 ? 1.5 : 1.4983,
    brightnessHz: 280 + positive * 1050 + energy * 900 - turbulence * 180,
    droneGain: 0.045 + energy * 0.025,
    noteGain: 0.035 + energy * 0.055,
    noteIntervalMinMs: 4_000 - energy * 1_900 + (1 - positive) * 700,
    noteIntervalMaxMs: 10_000 - energy * 4_000 + (1 - positive) * 1_300,
    scale: positive >= 0.5 ? BRIGHT_SCALE : DARK_SCALE,
  };
}

export function nextAmbientDelay(scene: AmbientScene, random = Math.random): number {
  const value = clamp(random(), 0, 1);
  return Math.round(
    scene.noteIntervalMinMs + (scene.noteIntervalMaxMs - scene.noteIntervalMinMs) * value,
  );
}

export function nextAmbientFrequency(scene: AmbientScene, random = Math.random): number {
  const index = Math.min(scene.scale.length - 1, Math.floor(clamp(random(), 0, 0.999999) * scene.scale.length));
  const semitone = scene.scale[index];
  const octave = random() > 0.72 ? 2 : 1;
  return scene.rootHz * octave * 2 ** (semitone / 12);
}

export function volumeToGain(volume: number): number {
  const normalized = clamp(volume, 0, 1);
  return normalized * normalized * 0.42;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
