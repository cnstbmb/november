import { describe, expect, it } from 'vitest';
import { anyMoexMarketOpen, isTradingNow } from '../src/market-hours';

// 2026-07-28 is a Tuesday.
const TUE_FX_OPEN = new Date('2026-07-28T03:55:00.000Z'); // 06:55 MSK (fx open 06:50)
const TUE_FX_CLOSED = new Date('2026-07-28T03:00:00.000Z'); // 06:00 MSK (before fx open)
const TUE_INDEX_OPEN = new Date('2026-07-28T07:00:00.000Z'); // 10:00 MSK
const TUE_INDEX_EARLY = new Date('2026-07-28T06:55:00.000Z'); // 09:55 MSK? -> index open 09:50 -> open
const SAT_NOON = new Date('2026-08-01T09:00:00.000Z'); // 12:00 MSK Saturday

describe('market-hours', () => {
  it('fx opens at 06:50 MSK on weekdays', () => {
    expect(isTradingNow('fx', TUE_FX_OPEN)).toBe(true);
    expect(isTradingNow('fx', TUE_FX_CLOSED)).toBe(false);
  });

  it('index opens at 09:50 MSK on weekdays', () => {
    expect(isTradingNow('index', TUE_INDEX_OPEN)).toBe(true);
    expect(isTradingNow('index', TUE_INDEX_EARLY)).toBe(true);
  });

  it('crypto is always trading', () => {
    expect(isTradingNow('crypto', SAT_NOON)).toBe(true);
    expect(isTradingNow('crypto', TUE_FX_CLOSED)).toBe(true);
  });

  it('MOEX is closed on weekends', () => {
    expect(isTradingNow('fx', SAT_NOON)).toBe(false);
    expect(isTradingNow('futures', SAT_NOON)).toBe(false);
    expect(isTradingNow('index', SAT_NOON)).toBe(false);
    expect(anyMoexMarketOpen(SAT_NOON)).toBe(false);
  });

  it('anyMoexMarketOpen true when at least one market open', () => {
    expect(anyMoexMarketOpen(TUE_FX_OPEN)).toBe(true);
  });
});
