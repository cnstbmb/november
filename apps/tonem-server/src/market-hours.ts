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
  futures: { open: 8 * 60 + 50, close: 23 * 60 + 50 }, // 08:50–23:50
  index: { open: 9 * 60 + 50, close: 19 * 60 }, // IMOEX: 09:50–19:00
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
  if (weekend) return kind === 'futures' && minutes >= 10 * 60 && minutes < 19 * 60;
  return minutes >= w.open && minutes < w.close;
}

/** True if any MOEX-backed market (fx / futures / index) is currently trading. */
export function anyMoexMarketOpen(now: Date): boolean {
  return (
    isTradingNow('fx', now) || isTradingNow('futures', now) || isTradingNow('index', now)
  );
}
