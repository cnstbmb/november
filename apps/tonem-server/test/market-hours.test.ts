import { describe, expect, it } from 'vitest';
import { anyMoexMarketOpen, isTradingNow } from '../src/market-hours';

// 2026-07-28 is a Tuesday.
const TUE_FX_OPEN = new Date('2026-07-28T07:00:00.000Z'); // 10:00 MSK
const TUE_FX_CLOSED = new Date('2026-07-28T06:59:00.000Z'); // 09:59 MSK
const TUE_FX_LAST_MINUTE = new Date('2026-07-28T15:59:00.000Z'); // 18:59 MSK
const TUE_FX_AFTER_CLOSE = new Date('2026-07-28T16:00:00.000Z'); // 19:00 MSK
const TUE_INDEX_OPEN = new Date('2026-07-28T07:00:00.000Z'); // 10:00 MSK
const TUE_INDEX_EARLY = new Date('2026-07-28T06:55:00.000Z'); // 09:55 MSK? -> index open 09:50 -> open
const SAT_NOON = new Date('2026-08-01T09:00:00.000Z'); // 12:00 MSK Saturday

describe('market-hours', () => {
  it('fx system session runs from 10:00 until 19:00 MSK on weekdays', () => {
    expect(isTradingNow('fx', TUE_FX_OPEN)).toBe(true);
    expect(isTradingNow('fx', TUE_FX_CLOSED)).toBe(false);
    expect(isTradingNow('fx', TUE_FX_LAST_MINUTE)).toBe(true);
    expect(isTradingNow('fx', TUE_FX_AFTER_CLOSE)).toBe(false);
  });

  it('index opens at 09:50 MSK on weekdays', () => {
    expect(isTradingNow('index', TUE_INDEX_OPEN)).toBe(true);
    expect(isTradingNow('index', TUE_INDEX_EARLY)).toBe(true);
  });

  it('IMOEX closes at 19:00 MSK', () => {
    expect(isTradingNow('index', new Date('2026-07-28T15:59:00.000Z'))).toBe(true);
    expect(isTradingNow('index', new Date('2026-07-28T16:00:00.000Z'))).toBe(false);
  });

  it('futures open at 08:50 on weekdays and 10:00-19:00 on weekends', () => {
    expect(isTradingNow('futures', new Date('2026-07-28T05:49:00.000Z'))).toBe(false);
    expect(isTradingNow('futures', new Date('2026-07-28T05:50:00.000Z'))).toBe(true);
    expect(isTradingNow('futures', new Date('2026-08-01T06:59:00.000Z'))).toBe(false);
    expect(isTradingNow('futures', new Date('2026-08-01T07:00:00.000Z'))).toBe(true);
    expect(isTradingNow('futures', new Date('2026-08-01T16:00:00.000Z'))).toBe(false);
  });

  it('crypto is always trading', () => {
    expect(isTradingNow('crypto', SAT_NOON)).toBe(true);
    expect(isTradingNow('crypto', TUE_FX_CLOSED)).toBe(true);
  });

  it('only the futures weekend session is open on weekends', () => {
    expect(isTradingNow('fx', SAT_NOON)).toBe(false);
    expect(isTradingNow('futures', SAT_NOON)).toBe(true);
    expect(isTradingNow('index', SAT_NOON)).toBe(false);
    expect(anyMoexMarketOpen(SAT_NOON)).toBe(true);
  });

  it('anyMoexMarketOpen true when at least one market open', () => {
    expect(anyMoexMarketOpen(TUE_FX_OPEN)).toBe(true);
  });
});
