import { describe, expect, it } from 'vitest';
import { decideSession } from './candle-session';

// вторник 2026-07-28; at(msk) — момент по Москве
const at = (msk: string) => new Date(`2026-07-28T${msk}:00+03:00`);

describe('decideSession — ночное правило', () => {
  it('рынок открыт днём → сегодня, current', () => {
    const d = decideSession('fx', at('12:00'));
    expect(d.session).toBe('current');
    expect(d.fromYmd).toBe('2026-07-28');
  });

  it('глубокая ночь → последняя сессия, предыдущий день', () => {
    const d = decideSession('fx', at('03:00'));
    expect(d.session).toBe('last');
    expect(d.fromYmd).toBe('2026-07-27');
  });

  it('после закрытия вечером → last (та же дата МСК, но сессия уже завершена)', () => {
    // fx закрывается в 23:50; в 23:55 — уже за окном → просим вчера
    const d = decideSession('fx', at('23:55'));
    expect(d.session).toBe('last');
    expect(d.fromYmd).toBe('2026-07-27');
  });

  it('выходные → последняя сессия', () => {
    // воскресенье 2026-07-26 днём
    const d = decideSession('index', new Date('2026-07-26T12:00:00+03:00'));
    expect(d.session).toBe('last');
    expect(d.fromYmd).toBe('2026-07-25');
  });

  it('crypto (null) — всегда сегодня, current', () => {
    const d = decideSession(null, at('03:00'));
    expect(d.session).toBe('current');
    expect(d.fromYmd).toBe('2026-07-28');
  });
});
