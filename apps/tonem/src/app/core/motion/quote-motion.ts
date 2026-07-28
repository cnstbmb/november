/**
 * Чистая модель «анимации котировки»: направление и флеш.
 * Без DOM — всё считается на числах/строках и потому юнит-тестируемо.
 * Барабаны цифр живут отдельно (odometer-reel.ts).
 */

/** Направление изменения значения. */
export type Direction = 'up' | 'down' | 'flat';

/** Класс подсветки: up — зелёный, down — красный, none — без вспышки. */
export type FlashKind = 'up' | 'down' | 'none';

/** Длительность затухания флеша (совпадает с CSS-анимацией компонента). */
export const FLASH_DURATION_MS = 1_000;

/**
 * Направление по двум значениям. Если хотя бы одно null (нет данных) —
 * сравнивать нечего, считаем flat: не флешим на появление/пропадание данных.
 */
export function directionOf(prev: number | null, next: number | null): Direction {
  if (prev === null || next === null) return 'flat';
  if (next > prev) return 'up';
  if (next < prev) return 'down';
  return 'flat';
}

/**
 * Класс флеша из направления. При reduced-motion вспышку гасим (none) —
 * значение должно обновиться мгновенно и без анимации.
 */
export function flashOf(direction: Direction, reducedMotion: boolean): FlashKind {
  if (reducedMotion || direction === 'flat') return 'none';
  return direction;
}

/** Сводный план движения котировки. */
export interface QuoteMotion {
  readonly direction: Direction;
  readonly flash: FlashKind;
}

/**
 * Единая точка: из prev/next и флага reduced-motion собирает направление и флеш.
 * Пер-дигитную прокрутку считает OdometerReel (ему нужен только direction).
 */
export function planQuoteMotion(args: {
  prevValue: number | null;
  nextValue: number | null;
  reducedMotion: boolean;
}): QuoteMotion {
  const direction = directionOf(args.prevValue, args.nextValue);
  return { direction, flash: flashOf(direction, args.reducedMotion) };
}
