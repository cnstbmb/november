import { describe, expect, it } from 'vitest';
import { parseMoexDateTime, moexTimeOnDate } from './moex-time';

describe('parseMoexDateTime', () => {
  it('парсит "2026-07-28 19:15:00" как московское время (UTC+3)', () => {
    const d = parseMoexDateTime('2026-07-28 19:15:00');
    expect(d?.toISOString()).toBe('2026-07-28T16:15:00.000Z');
  });

  it('возвращает null для null и пустой строки', () => {
    expect(parseMoexDateTime(null)).toBeNull();
    expect(parseMoexDateTime('')).toBeNull();
  });
});

describe('moexTimeOnDate', () => {
  it('приклеивает "18:41:09" к МСК-дате из systime', () => {
    const systime = new Date('2026-07-28T19:15:00.000+03:00');
    const d = moexTimeOnDate('18:41:09', systime);
    expect(d?.toISOString()).toBe('2026-07-28T15:41:09.000Z');
  });

  it('возвращает null, если нет времени или даты-опоры', () => {
    expect(moexTimeOnDate(null, new Date())).toBeNull();
    expect(moexTimeOnDate('18:41:09', null)).toBeNull();
  });
});
