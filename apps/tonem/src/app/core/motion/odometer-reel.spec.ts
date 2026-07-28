import { describe, expect, it } from 'vitest';
import {
  OdometerReel,
  REEL_LENGTH,
  advanceSlot,
  digitAt,
  toDigit,
} from './odometer-reel';

describe('toDigit / digitAt', () => {
  it('toDigit парсит цифру и отбрасывает прочее', () => {
    expect(toDigit('7')).toBe(7);
    expect(toDigit('0')).toBe(0);
    expect(toDigit(',')).toBeNull();
    expect(toDigit(' ')).toBeNull();
    expect(toDigit('—')).toBeNull();
  });

  it('digitAt устойчив к большим и отрицательным slot', () => {
    expect(digitAt(0)).toBe(0);
    expect(digitAt(23)).toBe(3);
    expect(digitAt(-1)).toBe(9);
    expect(digitAt(REEL_LENGTH + 5)).toBe(5);
  });
});

describe('advanceSlot', () => {
  it('up двигается вперёд на минимальный шаг', () => {
    expect(advanceSlot(23, 7, 'up')).toBe(27); // 3 → 7, +4
    expect(digitAt(27)).toBe(7);
  });

  it('down двигается назад на минимальный шаг', () => {
    expect(advanceSlot(27, 3, 'down')).toBe(23); // 7 → 3, −4
    expect(digitAt(23)).toBe(3);
  });

  it('перенос 9→0 вверх — один шаг вперёд', () => {
    const slot = advanceSlot(29, 0, 'up');
    expect(slot).toBe(30);
    expect(digitAt(slot)).toBe(0);
  });

  it('перенос 0→9 вниз — один шаг назад', () => {
    const slot = advanceSlot(20, 9, 'down');
    expect(slot).toBe(19);
    expect(digitAt(slot)).toBe(9);
  });

  it('flat не двигает барабан', () => {
    expect(advanceSlot(23, 9, 'flat')).toBe(23);
  });
});

describe('OdometerReel', () => {
  it('первая строка: цифры новые (changed), но ставятся без прокрутки — slot в середине ленты', () => {
    const reel = new OdometerReel();
    const rolls = reel.update('123', 'flat');
    expect(rolls.map((r) => r.char)).toEqual(['1', '2', '3']);
    expect(rolls.every((r) => r.isDigit)).toBe(true);
    expect(rolls.every((r) => r.changed)).toBe(true); // из пустоты — все новые
    expect(rolls.map((r) => digitAt(r.slot))).toEqual([1, 2, 3]);
    // slot покоя = цифра + середина ленты, без прокрутки
    expect(rolls[0].slot % 10).toBe(1);
  });

  it('разделители рендерятся статично (isDigit=false)', () => {
    const reel = new OdometerReel();
    const rolls = reel.update('1 234,56', 'flat');
    const seps = rolls.filter((r) => !r.isDigit);
    expect(seps.map((r) => r.char)).toEqual([' ', ',']);
    const digits = rolls.filter((r) => r.isDigit);
    expect(digits.map((r) => digitAt(r.slot))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('изменившиеся цифры помечаются changed и получают направление', () => {
    const reel = new OdometerReel();
    reel.update('123', 'flat');
    const rolls = reel.update('143', 'up'); // изменилась только средняя цифра
    expect(rolls.map((r) => r.changed)).toEqual([false, true, false]);
    expect(rolls[1].direction).toBe('up');
    expect(rolls[0].direction).toBe('flat');
  });

  it('прокрутка вверх: slot сдвигается вперёд до новой цифры', () => {
    const reel = new OdometerReel();
    const before = reel.update('5', 'flat')[0].slot;
    const after = reel.update('8', 'up')[0].slot;
    expect(after).toBe(before + 3);
    expect(digitAt(after)).toBe(8);
  });

  it('прокрутка вниз: slot сдвигается назад', () => {
    const reel = new OdometerReel();
    const before = reel.update('8', 'flat')[0].slot;
    const after = reel.update('5', 'down')[0].slot;
    expect(after).toBe(before - 3);
    expect(digitAt(after)).toBe(5);
  });

  it('перенос разряда 199→200 крутит все цифры вверх', () => {
    const reel = new OdometerReel();
    reel.update('199', 'flat');
    const rolls = reel.update('200', 'up');
    expect(rolls.map((r) => digitAt(r.slot))).toEqual([2, 0, 0]);
    expect(rolls.every((r) => r.direction === 'up')).toBe(true);
  });

  it('200→199 крутит все цифры вниз (направление от значения, не от цифры)', () => {
    const reel = new OdometerReel();
    reel.update('200', 'flat');
    const rolls = reel.update('199', 'down');
    expect(rolls.map((r) => digitAt(r.slot))).toEqual([1, 9, 9]);
    expect(rolls.every((r) => r.direction === 'down')).toBe(true);
  });

  it('смена длины 999→1 000: новые цифры ставятся, выравнивание справа', () => {
    const reel = new OdometerReel();
    reel.update('999', 'flat');
    const rolls = reel.update('1 000', 'up');
    const digits = rolls.filter((r) => r.isDigit);
    expect(digits.map((r) => digitAt(r.slot))).toEqual([1, 0, 0, 0]);
  });

  it('reduced-motion (flat): цифра меняется мгновенно, changed не ведёт к прокрутке', () => {
    const reel = new OdometerReel();
    reel.update('5', 'flat');
    const rolls = reel.update('8', 'flat'); // как при prefers-reduced-motion
    expect(rolls[0].changed).toBe(true);
    expect(rolls[0].direction).toBe('flat');
    expect(digitAt(rolls[0].slot)).toBe(8); // цифра корректная
  });

  it('барабан продолжает с того же slot между обновлениями', () => {
    const reel = new OdometerReel();
    const s0 = reel.update('5', 'flat')[0].slot;
    const s1 = reel.update('5', 'up')[0].slot; // не изменилась — slot тот же
    expect(s1).toBe(s0);
  });
});
