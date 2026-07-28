import { describe, expect, it } from 'vitest';
import { DEFAULT_SCALE, minMax, pointsAttr, toPolylinePoints } from './polyline';

const S = { width: 100, height: 40, padY: 5, padX: 2 }; // == DEFAULT_SCALE

describe('toPolylinePoints — масштабирование min/max в viewBox', () => {
  it('минимум внизу, максимум вверху (y инвертирован)', () => {
    const pts = toPolylinePoints([10, 20, 30], S);
    expect(pts).toHaveLength(3);
    // min=10 → y = height - padY = 35 (низ); max=30 → y = padY = 5 (верх)
    expect(pts[0].y).toBe(35);
    expect(pts[2].y).toBe(5);
    // середина ровно посередине
    expect(pts[1].y).toBe(20);
  });

  it('x распределён равномерно между паддингами', () => {
    const pts = toPolylinePoints([1, 2, 3, 4, 5], S);
    expect(pts[0].x).toBe(2); // padX
    expect(pts[4].x).toBe(98); // width - padX
    expect(pts[2].x).toBe(50); // центр
  });

  it('одинаковые значения (min == max) → посередине, без деления на 0', () => {
    const pts = toPolylinePoints([7, 7, 7], S);
    for (const p of pts) expect(p.y).toBe(20); // (padY + innerH/2)
  });

  it('одно значение → одна точка посередине, x = padX', () => {
    const pts = toPolylinePoints([42], S);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBe(2);
    expect(pts[0].y).toBe(20);
  });

  it('пустой ряд → пустой массив', () => {
    expect(toPolylinePoints([], S)).toEqual([]);
  });

  it('крайние значения не выходят за пределы viewBox', () => {
    const pts = toPolylinePoints([-5, 0, 100, 3], S);
    for (const p of pts) {
      expect(p.y).toBeGreaterThanOrEqual(5);
      expect(p.y).toBeLessThanOrEqual(35);
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.x).toBeLessThanOrEqual(98);
    }
  });
});

describe('pointsAttr', () => {
  it('склеивает "x,y" через пробел', () => {
    const pts = toPolylinePoints([10, 20, 30], S);
    expect(pointsAttr(pts)).toBe('2,35 50,20 98,5');
  });
});

describe('minMax', () => {
  it('находит крайние значения ряда', () => {
    expect(minMax([3, 9, 1, 5])).toEqual({ min: 1, max: 9 });
  });

  it('пустой ряд → null', () => {
    expect(minMax([])).toEqual({ min: null, max: null });
  });
});

describe('DEFAULT_SCALE', () => {
  it('соответствует viewBox 100×40', () => {
    expect(DEFAULT_SCALE.width).toBe(100);
    expect(DEFAULT_SCALE.height).toBe(40);
  });
});
