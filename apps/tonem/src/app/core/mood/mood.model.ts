/**
 * Чистая математика «настроения рынка»: из живых котировок и базовой линии
 * (first-seen за сессию) вычисляет три нормированных канала — hue/energy/turbulence.
 * Без DOM и без Angular — всё на числах, юнит-тестируемо изолированно.
 *
 * Каналы и диапазоны:
 *  - moodHue        ∈ [-1, +1]  направление: <0 падение (холод), >0 рост (тепло)
 *  - moodEnergy     ∈ [0, 1]    величина движения / уровень активности
 *  - moodTurbulence ∈ [0, 1]    разброс/несогласованность инструментов (дисперсия дельт)
 */

export const MOOD_RANGE = { min: -1, max: 1 } as const;

/**
 * Масштаб «значимого» хода за сессию, в % (0.4% ≈ 1σ дневного хода ликвидного
 * инструмента). Дельты нормируются на него через tanh, поэтому ±1 достигается
 * плавно, а не клиппингом — сильные тренды не слипаются в одно значение.
 */
export const MOOD_SIGMA_PCT = 0.4;

/**
 * Экспонента сжатия turbulence: 1 - exp(-disp/TAU). TAU подобран так, чтобы при
 * типичном разбросе нормированных дельт turbulence была чувствительна, но не
 * насыщалась мгновенно.
 */
export const MOOD_TURBULENCE_TAU = 0.25;

/** Вход одного инструмента: базовая цена (first-seen за сессию) и текущая. */
export interface MoodSample {
  readonly id: string;
  readonly baseline: number;
  readonly current: number;
}

/** Нормированное настроение рынка (три канала, см. диапазоны выше). */
export interface MarketMood {
  /** Направление: [-1..+1], <0 падение/холод, >0 рост/тепло, 0 нейтрально. */
  readonly hue: number;
  /** Энергия: [0..1], средняя |нормированная дельта| — насколько активен рынок. */
  readonly energy: number;
  /** Турбулентность: [0..1], дисперсия дельт — насколько инструменты расходятся. */
  readonly turbulence: number;
}

/** Процентная дельта одного инструмента относительно baseline, в долях (0.01 = 1%). */
export function deltaPct(sample: MoodSample): number {
  if (sample.baseline <= 0) return 0;
  return (sample.current - sample.baseline) / sample.baseline;
}

/** Нормирует дельту через tanh к [-1, +1]: мягкое насыщение без жёсткого клипа. */
export function normalizeDelta(delta: number, sigmaPct = MOOD_SIGMA_PCT): number {
  return Math.tanh(delta / (sigmaPct / 100));
}

/** Среднее массива чисел; пустой → 0. */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Среднеквадратичное отклонение (population); пустой/один элемент → 0. */
function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return Math.sqrt(sum / values.length);
}

/**
 * Агрегирует набор инструментов в MarketMood.
 * Все инструменты равновесны (mean), т.к. реестр уже курирует живой набор —
 * взвешивание по капитализации/объёму дало бы ложную точность при 14 тикерах.
 */
export function aggregateMood(samples: readonly MoodSample[]): MarketMood {
  const deltas = samples.map((s) => normalizeDelta(deltaPct(s)));
  const hue = clamp(mean(deltas), MOOD_RANGE.min, MOOD_RANGE.max);
  const energy = clamp01(mean(deltas.map(Math.abs)));
  const turbulence = clamp01(1 - Math.exp(-stddev(deltas) / MOOD_TURBULENCE_TAU));
  return { hue, energy, turbulence };
}

/** Ограничивает значение диапазоном [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Ограничивает значение диапазоном [0, 1]. */
export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

// ── Сглаживание (EMA) ─────────────────────────────────────────────────────────

/**
 * Экспоненциальное скользящее среднее с коэффициентом alpha ∈ (0, 1].
 * alpha = 1 — мгновенно к цели; малый alpha — медленное, плавное приближение.
 * Гарантирует: шаг к цели никогда не превышает alpha * |target - current|,
 * поэтому скачков палитры быть не может при любом входе.
 */
export function ema(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

/**
 * Каденс обновления сглаженных сигналов (мс). Спокойный темп — настроение
 * не должно дёргаться вместе с тиком, поэтому раз в ~1.2с.
 */
export const MOOD_TICK_MS = 1_200;

/**
 * Alpha EMA, подобранный под MOOD_TICK_MS и желаемое время сходимости.
 * При alpha=0.06 за тик 1.2с половина пути до цели проходится за ~14с,
 * ~95% — за ~60с: переходы занимают десятки секунд, как и требуется.
 */
export const MOOD_EMA_ALPHA = 0.06;

/** Текущее сглаженное настроение (тот же формат, что и мгновенное). */
export type SmoothedMood = MarketMood;

/** Один шаг EMA по всем трём каналам настроения. */
export function smoothMood(
  current: SmoothedMood,
  target: MarketMood,
  alpha = MOOD_EMA_ALPHA,
): SmoothedMood {
  return {
    hue: ema(current.hue, target.hue, alpha),
    energy: ema(current.energy, target.energy, alpha),
    turbulence: ema(current.turbulence, target.turbulence, alpha),
  };
}

/** Стартовое сглаженное настроение — нейтраль, чтобы не было всплеска на загрузке. */
export function neutralMood(): SmoothedMood {
  return { hue: 0, energy: 0, turbulence: 0 };
}
