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

  it('fx: закрыт до начала системной сессии в 10:00', () => {
    expect(isTradingNow('fx', at('09:59'))).toBe(false);
    expect(isTradingNow('fx', at('10:00'))).toBe(true);
  });

  it('fx: закрыт с окончания системной сессии в 19:00', () => {
    expect(isTradingNow('fx', at('18:59'))).toBe(true);
    expect(isTradingNow('fx', at('19:00'))).toBe(false);
  });

  it('index: закрыт рано утром, открыт в 10:00', () => {
    expect(isTradingNow('index', at('07:00'))).toBe(false);
    expect(isTradingNow('index', at('10:00'))).toBe(true);
  });

  it('index: закрывается вместе с расчётом IMOEX в 19:00', () => {
    expect(isTradingNow('index', at('18:59'))).toBe(true);
    expect(isTradingNow('index', at('19:00'))).toBe(false);
  });

  it('futures: будняя сессия начинается в 06:50', () => {
    expect(isTradingNow('futures', at('06:49'))).toBe(false);
    expect(isTradingNow('futures', at('06:50'))).toBe(true);
  });

  it('futures: до 14 июля 2026 сохраняет историческое открытие 08:50', () => {
    const beforeChange = (hhmm: string) => new Date(`2026-07-13T${hhmm}:00+03:00`);
    expect(isTradingNow('futures', beforeChange('08:49'))).toBe(false);
    expect(isTradingNow('futures', beforeChange('08:50'))).toBe(true);
  });

  it('futures: выходная сессия работает с 10:00 до 19:00', () => {
    const sunday = (hhmm: string) => new Date(`2026-07-26T${hhmm}:00+03:00`);
    expect(isTradingNow('futures', sunday('09:59'))).toBe(false);
    expect(isTradingNow('futures', sunday('10:00'))).toBe(true);
    expect(isTradingNow('futures', sunday('18:59'))).toBe(true);
    expect(isTradingNow('futures', sunday('19:00'))).toBe(false);
  });

  it('fx и index закрыты в выходные', () => {
    expect(isTradingNow('fx', new Date('2026-07-26T12:00:00+03:00'))).toBe(false);
    expect(isTradingNow('index', new Date('2026-07-26T12:00:00+03:00'))).toBe(false);
  });
});

describe('deriveStatus', () => {
  it('unavailable, если нет цены', () => {
    expect(
      deriveStatus({ value: null, receivedAt: at('12:00'), market: 'fx', now: at('12:00') }),
    ).toBe('unavailable');
  });

  it('closed вне торгового окна, даже со свежей ценой', () => {
    expect(
      deriveStatus({ value: 78.5, receivedAt: at('23:50'), market: 'fx', now: at('00:45') }),
    ).toBe('closed');
  });

  it('live внутри окна при свежем ответе', () => {
    expect(
      deriveStatus({ value: 78.5, receivedAt: at('11:59'), market: 'fx', now: at('12:00') }),
    ).toBe('live');
  });

  it('stale внутри окна, если источник не отвечал >10 минут', () => {
    expect(
      deriveStatus({ value: 78.5, receivedAt: at('11:30'), market: 'fx', now: at('12:00') }),
    ).toBe('stale');
  });

  it('closed после 19:00 для последней котировки CNY, а не stale', () => {
    expect(
      deriveStatus({ value: 12.081, receivedAt: at('19:15'), market: 'fx', now: at('22:39') }),
    ).toBe('closed');
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
