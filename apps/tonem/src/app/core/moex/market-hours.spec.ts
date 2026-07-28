import { describe, expect, it } from 'vitest';
import { deriveStatus, isTradingNow, pollDelayMs } from './market-hours';

// вторник 2026-07-28
const at = (msk: string) => new Date(`2026-07-28T${msk}:00+03:00`);

describe('isTradingNow', () => {
  it('fx: торгует днём будня', () => {
    expect(isTradingNow('fx', at('12:00'))).toBe(true);
  });

  it('fx: закрыт глубокой ночью (03:00)', () => {
    expect(isTradingNow('fx', at('03:00'))).toBe(false);
  });

  it('fx: ещё закрыт в 06:00, уже торгует в 06:55', () => {
    expect(isTradingNow('fx', at('06:00'))).toBe(false);
    expect(isTradingNow('fx', at('06:55'))).toBe(true);
  });

  it('fx: торгует вечером 23:30, закрыт после 23:50', () => {
    expect(isTradingNow('fx', at('23:30'))).toBe(true);
    expect(isTradingNow('fx', at('23:55'))).toBe(false);
  });

  it('index: закрыт рано утром, открыт в 10:00', () => {
    expect(isTradingNow('index', at('07:00'))).toBe(false);
    expect(isTradingNow('index', at('10:00'))).toBe(true);
  });

  it('выходные закрыты даже днём', () => {
    // воскресенье 2026-07-26, 12:00 МСК
    expect(isTradingNow('fx', new Date('2026-07-26T12:00:00+03:00'))).toBe(false);
    expect(isTradingNow('futures', new Date('2026-07-26T12:00:00+03:00'))).toBe(false);
  });
});

describe('deriveStatus', () => {
  it('unavailable, если нет цены', () => {
    expect(
      deriveStatus({ value: null, systime: at('12:00'), market: 'fx', now: at('12:00') }),
    ).toBe('unavailable');
  });

  it('closed вне торгового окна, даже со свежей ценой', () => {
    expect(
      deriveStatus({ value: 78.5, systime: at('23:50'), market: 'fx', now: at('00:45') }),
    ).toBe('closed');
  });

  it('live внутри окна при свежем systime', () => {
    expect(
      deriveStatus({ value: 78.5, systime: at('11:59'), market: 'fx', now: at('12:00') }),
    ).toBe('live');
  });

  it('stale внутри окна, если фид молчит >10 минут', () => {
    expect(
      deriveStatus({ value: 78.5, systime: at('11:30'), market: 'fx', now: at('12:00') }),
    ).toBe('stale');
  });
});

describe('pollDelayMs', () => {
  it('10 секунд, если есть живые или подозрительные котировки', () => {
    expect(pollDelayMs(['live', 'closed'])).toBe(10_000);
    expect(pollDelayMs(['stale'])).toBe(10_000);
  });

  it('5 минут, если все рынки закрыты или данных нет', () => {
    expect(pollDelayMs(['closed', 'closed'])).toBe(300_000);
    expect(pollDelayMs(['unavailable'])).toBe(300_000);
    expect(pollDelayMs([])).toBe(300_000);
  });
});
