/**
 * Отображение нормированного настроения в конкретные CSS-значения.
 * Чистое, без DOM — выдаёт числа/строки, которые движок пишет в custom properties.
 *
 * Идея палитры: рынок в росте → тёплый (янтарь ~35°), в падении → холодный
 * (сталь/синий ~215°), нейтрально → приглушённый синевато-серый (~230°, близко к --bg).
 * hue ∈ [-1,+1] интерполируется между этими полюсами.
 */

import { MarketMood, clamp01 } from './mood.model';

/** Полюс «падение»: холодный синий. */
export const HUE_FALLING = 215;
/** Полюс «нейтраль»: холодный серо-синий, близко к базовому --bg. */
export const HUE_NEUTRAL = 230;
/** Полюс «рост»: тёплый янтарь. */
export const HUE_RISING = 35;

/** CSS-переменные, которые пишет движок на :root. */
export const MOOD_VAR_HUE = '--mood-hue';
export const MOOD_VAR_ENERGY = '--mood-energy';
export const MOOD_VAR_TURBULENCE = '--mood-turbulence';

/**
 * hue ∈ [-1,+1] → градусы [0..360).
 * Отрицательный hue идёт от нейтрали к холодному полюсу, положительный — к тёплому.
 * Интерполяция линейная: нейтраль в центре, полюса на краях.
 */
export function moodHueDegrees(hue: number): number {
  if (hue < 0) {
    // -1 → HUE_FALLING, 0 → HUE_NEUTRAL
    return HUE_NEUTRAL + (HUE_FALLING - HUE_NEUTRAL) * -hue;
  }
  // 0 → HUE_NEUTRAL, +1 → HUE_RISING
  return HUE_NEUTRAL + (HUE_RISING - HUE_NEUTRAL) * hue;
}

/** Форматирует число для CSS-переменной (стабильные 3 знака, чтобы не дёргать строку). */
function fmt(v: number): string {
  return v.toFixed(3);
}

/**
 * Собирает значения трёх CSS-переменных из настроения.
 * hue пишется в градусах (для hsl()), energy/turbulence — как 0..1 (для calc()).
 */
export function moodCssValues(mood: MarketMood): {
  readonly hue: string;
  readonly energy: string;
  readonly turbulence: string;
} {
  return {
    hue: moodHueDegrees(mood.hue).toFixed(1),
    energy: fmt(clamp01(mood.energy)),
    turbulence: fmt(clamp01(mood.turbulence)),
  };
}
