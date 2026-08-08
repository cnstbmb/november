/**
 * Trading windows (MSK). Ported from
 * apps/tonem/src/app/core/moex/market-hours.ts — only what the collector needs.
 */
import { MarketKind } from './instruments';

/** Trading windows in minutes from MSK midnight (weekdays). crypto = no window (24/7). */
const WINDOWS: Record<MarketKind, { open: number; close: number } | null> = {
  // MOEX CETS system session used by QuoteSourcesService. The 23:50 close
  // belongs to negotiated trading modes, which are not collected here.
  fx: { open: 10 * 60, close: 19 * 60 }, // 10:00–19:00
  futures: { open: 8 * 60 + 50, close: 23 * 60 + 50 }, // historical default
  index: { open: 9 * 60 + 50, close: 19 * 60 }, // IMOEX: 09:50–19:00
  crypto: null, // 24/7
};

const mskClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FUTURES_EARLY_OPEN_FROM = '2026-07-14';

function mskParts(now: Date): { minutes: number; weekend: boolean; date: string } {
  const parts = mskClock.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hh = get('hour') === '24' ? 0 : Number(get('hour'));
  const weekday = get('weekday');
  return {
    minutes: hh * 60 + Number(get('minute')),
    weekend: weekday === 'Sat' || weekday === 'Sun',
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export function isTradingNow(kind: MarketKind, now: Date): boolean {
  const w = WINDOWS[kind];
  if (w === null) return true; // crypto: always open
  const { minutes, weekend, date } = mskParts(now);
  if (weekend) return kind === 'futures' && minutes >= 10 * 60 && minutes < 19 * 60;
  const open = kind === 'futures' && date >= FUTURES_EARLY_OPEN_FROM
    ? 6 * 60 + 50
    : w.open;
  return minutes >= open && minutes < w.close;
}

/** True if any MOEX-backed market (fx / futures / index) is currently trading. */
export function anyMoexMarketOpen(now: Date): boolean {
  return (
    isTradingNow('fx', now) || isTradingNow('futures', now) || isTradingNow('index', now)
  );
}
