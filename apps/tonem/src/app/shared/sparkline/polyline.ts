/**
 * Геометрия спарклайна: нормализация min/max → координаты SVG-viewBox.
 * Чистые функции, чтобы тестировать масштабирование без DOM.
 */

export interface PolyPoint {
  readonly x: number;
  readonly y: number;
}

export interface SparkScale {
  readonly width: number;
  readonly height: number;
  /** вертикальный отступ, чтобы линия не касалась краёв и подписей */
  readonly padY: number;
  readonly padX: number;
}

export const DEFAULT_SCALE: SparkScale = { width: 100, height: 40, padY: 5, padX: 2 };

function extent(values: readonly number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Строит точки полилинии из значений (close), нормализуя их в viewBox.
 * y инвертируется (в SVG 0 сверху): большее значение → выше → меньший y.
 * Плоский ряд (min === max) кладём посередине, чтобы не было деления на 0.
 */
export function toPolylinePoints(
  values: readonly number[],
  scale: SparkScale = DEFAULT_SCALE,
): PolyPoint[] {
  const n = values.length;
  if (n === 0) return [];
  const { width, height, padY, padX } = scale;
  const { min, max } = extent(values);
  const span = max - min;
  const innerH = height - padY * 2;
  const innerW = width - padX * 2;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  return values.map((v, i) => {
    const t = span === 0 ? 0.5 : (v - min) / span; // 0..1 снизу вверх
    const x = padX + i * stepX;
    const y = padY + (1 - t) * innerH;
    return { x: round(x), y: round(y) };
  });
}

/** Точки в строку для атрибута points="x,y x,y …" полилинии. */
export function pointsAttr(points: readonly PolyPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

const round = (v: number): number => Math.round(v * 100) / 100;

/** min/max значений ряда для подписей дня. */
export function minMax(values: readonly number[]): { min: number | null; max: number | null } {
  if (values.length === 0) return { min: null, max: null };
  const { min, max } = extent(values);
  return { min, max };
}
