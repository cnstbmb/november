/**
 * Trading windows (MSK). Ported from
 * apps/tonem/src/app/core/moex/market-hours.ts — only what the collector needs.
 */
import { MarketKind } from './instruments';

/** Trading windows in minutes from MSK midnight (weekdays). crypto = no window (24/7). */
const WINDOWS: Record<MarketKind, { open: number; close: number } | null> = {
  fx: { open: 6 * 60 + 50, close: 23 * 60 + 50 }, // 06:50–23:50
  futures: { open: 9 * 60, close: 23 * 60 + 50 }, // 09:00–23:50
  index: { open: 9 * 60 + 50, close: 23 * 60 + 50 }, // 09:50–23:50
  crypto: null, // 24/7
};

const mskClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
});

function mskParts(now: Date): { minutes: number; weekend: boolean } {
  const parts = mskClock.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hh = get('hour') === '24' ? 0 : Number(get('hour'));
  const weekday = get('weekday');
  return {
    minutes: hh * 60 + Number(get('minute')),
    weekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

export function isTradingNow(kind: MarketKind, now: Date): boolean {
  const w = WINDOWS[kind];
  if (w === null) return true; // crypto: always open
  const { minutes, weekend } = mskParts(now);
  if (weekend) return false;
  return minutes >= w.open && minutes < w.close;
}

/** True if any MOEX-backed market (fx / futures / index) is currently trading. */
export function anyMoexMarketOpen(now: Date): boolean {
  return (
    isTradingNow('fx', now) || isTradingNow('futures', now) || isTradingNow('index', now)
  );
}
