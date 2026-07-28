import { describe, expect, it } from 'vitest';
import { directionOf, flashOf, planQuoteMotion } from './quote-motion';

describe('directionOf', () => {
  it('up при росте, down при падении, flat при равенстве', () => {
    expect(directionOf(100, 101)).toBe('up');
    expect(directionOf(100, 99)).toBe('down');
    expect(directionOf(100, 100)).toBe('flat');
  });

  it('null с любой стороны → flat (не флешим появление/пропадание данных)', () => {
    expect(directionOf(null, 100)).toBe('flat');
    expect(directionOf(100, null)).toBe('flat');
    expect(directionOf(null, null)).toBe('flat');
  });

  it('корректно работает с дробными значениями', () => {
    expect(directionOf(78.58, 78.59)).toBe('up');
    expect(directionOf(78.58, 78.58)).toBe('flat');
  });
});

describe('flashOf', () => {
  it('up → зелёный, down → красный, flat → без вспышки', () => {
    expect(flashOf('up', false)).toBe('up');
    expect(flashOf('down', false)).toBe('down');
    expect(flashOf('flat', false)).toBe('none');
  });

  it('reduced-motion гасит вспышку даже при живом направлении', () => {
    expect(flashOf('up', true)).toBe('none');
    expect(flashOf('down', true)).toBe('none');
  });
});

describe('planQuoteMotion', () => {
  it('собирает направление и флеш вместе', () => {
    expect(planQuoteMotion({ prevValue: 1, nextValue: 2, reducedMotion: false })).toEqual({
      direction: 'up',
      flash: 'up',
    });
    expect(planQuoteMotion({ prevValue: 2, nextValue: 1, reducedMotion: false })).toEqual({
      direction: 'down',
      flash: 'down',
    });
  });

  it('reduced-motion: направление считаем, но флеш отключаем', () => {
    const plan = planQuoteMotion({ prevValue: 1, nextValue: 2, reducedMotion: true });
    expect(plan.direction).toBe('up');
    expect(plan.flash).toBe('none');
  });
});
