/**
 * Чистое отображение настроения в параметры отрисовки авроры: цвета, скорость
 * течения, шум. Без canvas и без DOM — юнит-тестируемо на числах.
 *
 * Вход — сглаженное настроение (hue ∈ [-1,+1], energy/turbulence ∈ [0,1]).
 * Палитра: рост → тёплый (янтарь), падение → холодный (синий/сталь).
 */

import { MarketMood, clamp01 } from '../../core/mood/mood.model';
import { HUE_FALLING, HUE_NEUTRAL, HUE_RISING } from '../../core/mood/mood.palette';

/** Параметры отрисовки одного кадра авроры. */
export interface AuroraFrame {
  /** Основной hue (градусы 0..360) для больших плазменных клякс. */
  readonly primaryHue: number;
  /** Дополнительный hue (сдвинут относительно основного) для глубины. */
  readonly secondaryHue: number;
  /** Насыщенность 0..100 (hsl s%). */
  readonly saturation: number;
  /** Скорость течения (множитель фазы в рад/с): растёт с energy. */
  readonly flowSpeed: number;
  /** Амплитуда шума/дрожания клякс: растёт с turbulence. */
  readonly jitter: number;
  /** Прозрачность клякс 0..1: чуть ярче при высокой энергии. */
  readonly alpha: number;
}

/** Минимальная скорость течения — аврора всегда слегка живёт, даже в штиль. */
const FLOW_MIN = 0.05;
/** Диапазон скорости, добавляемый энергией. */
const FLOW_RANGE = 0.35;

/**
 * hue ∈ [-1,+1] → основной цвет в градусах. Нейтраль посередине, падение —
 * холодный полюс, рост — тёплый. Совпадает по смыслу с moodHueDegrees, но
 * держим отдельно: авроре нужен собственный, более широкий разброс оттенков.
 */
export function auroraPrimaryHue(hue: number): number {
  if (hue < 0) return HUE_NEUTRAL + (HUE_FALLING - HUE_NEUTRAL) * -hue;
  return HUE_NEUTRAL + (HUE_RISING - HUE_NEUTRAL) * hue;
}

/**
 * Дополнительный hue — сдвинут к контрастной стороне для глубины: при росте
 * чуть холоднее основного, при падении чуть теплее. Модуль 360.
 */
export function auroraSecondaryHue(primaryHue: number, hue: number): number {
  const shift = 60 * (hue >= 0 ? -1 : 1); // рост → −60° (холоднее), падение → +60° (теплее)
  return (primaryHue + shift + 360) % 360;
}

/** Собирает полный набор параметров кадра из настроения. */
export function auroraFrame(mood: MarketMood): AuroraFrame {
  const primaryHue = auroraPrimaryHue(mood.hue);
  const energy = clamp01(mood.energy);
  const turbulence = clamp01(mood.turbulence);
  return {
    primaryHue,
    secondaryHue: auroraSecondaryHue(primaryHue, mood.hue),
    // падение — более насыщенный холод, рост — мягче; нейтраль — приглушённо
    saturation: 55 + 25 * energy,
    flowSpeed: FLOW_MIN + FLOW_RANGE * energy,
    jitter: turbulence,
    alpha: 0.10 + 0.12 * energy,
  };
}
