import { describe, expect, it } from 'vitest';
import { formatTime, formatValue } from './value.format';

describe('formatValue', () => {
  it('форматирует FX с двумя знаками', () => {
    expect(formatValue(78.58, 2)).toBe('78,58');
  });

  it('округляет до заданных знаков', () => {
    expect(formatValue(79.4852, 2)).toBe('79,49');
  });

  it('ноль знаков + разделитель тысяч', () => {
    const s = formatValue(10206, 0);
    // ru-RU использует неразрывный пробел между тысячами
    expect(s.replace(/ /g, ' ')).toBe('10 206');
  });

  it('null → тире', () => {
    expect(formatValue(null, 2)).toBe('—');
  });
});

describe('formatTime', () => {
  it('ЧЧ:мм по Москве', () => {
    expect(formatTime(new Date('2026-07-28T15:41:09.000Z'))).toBe('18:41');
  });

  it('null → пустая строка', () => {
    expect(formatTime(null)).toBe('');
  });
});
