import { describe, expect, it } from 'vitest';
import { selectNearestAtOrBefore, tickUniqueKey } from '../src/tick-store';

describe('tickUniqueKey (idempotent upsert key)', () => {
  it('builds the (instrument, ts) compound key', () => {
    const ts = new Date('2026-07-28T19:15:00.000Z');
    expect(tickUniqueKey('btc', ts)).toEqual({ instrument: 'btc', ts });
  });

  it('same minute produces the same key (idempotency)', () => {
    const a = tickUniqueKey('usdrub', new Date('2026-07-28T19:15:00.000Z'));
    const b = tickUniqueKey('usdrub', new Date('2026-07-28T19:15:00.000Z'));
    expect(a).toEqual(b);
  });
});

describe('selectNearestAtOrBefore (/at selection)', () => {
  const rows = [
    { ts: new Date('2026-07-28T19:10:00Z'), value: 1 },
    { ts: new Date('2026-07-28T19:15:00Z'), value: 2 },
    { ts: new Date('2026-07-28T19:20:00Z'), value: 3 },
  ];

  it('picks the nearest tick at or before the target', () => {
    const target = new Date('2026-07-28T19:17:00Z');
    const best = selectNearestAtOrBefore(rows, target);
    expect(best).not.toBeNull();
    expect(best!.value).toBe(2);
    expect(best!.ts).toEqual(new Date('2026-07-28T19:15:00Z'));
  });

  it('includes an exact match', () => {
    const target = new Date('2026-07-28T19:15:00Z');
    expect(selectNearestAtOrBefore(rows, target)!.value).toBe(2);
  });

  it('excludes ticks strictly after the target', () => {
    const target = new Date('2026-07-28T19:19:59Z');
    expect(selectNearestAtOrBefore(rows, target)!.value).toBe(2);
  });

  it('returns null when nothing is at or before target', () => {
    const target = new Date('2026-07-28T19:00:00Z');
    expect(selectNearestAtOrBefore(rows, target)).toBeNull();
  });

  it('handles unordered input', () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    const target = new Date('2026-07-28T19:17:00Z');
    expect(selectNearestAtOrBefore(shuffled, target)!.value).toBe(2);
  });
});
