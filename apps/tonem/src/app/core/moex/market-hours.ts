import { QuoteStatus } from '../rates/quote.model';
import { MarketKind } from '../instruments/instrument.model';

export type { MarketKind };

/** Торговые окна в минутах от полуночи МСК (будни). crypto — без окна (24/7). */
const WINDOWS: Record<MarketKind, { open: number; close: number } | null> = {
  // MOEX CETS system session used by MoexIssService. The 23:50 close applies
  // to negotiated trading modes, whose quotes this application does not read.
  fx: { open: 10 * 60, close: 19 * 60 }, // 10:00–19:00
  futures: { open: 8 * 60 + 50, close: 23 * 60 + 50 }, // historical default
  index: { open: 9 * 60 + 50, close: 19 * 60 }, // IMOEX: 09:50–19:00
  crypto: null, // торгуется круглосуточно, без выходных
};

/** Фид старше этого возраста внутри торгового окна = stale */
export const STALE_AFTER_MS = 10 * 60_000;

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
  if (w === null) return true; // crypto: всегда открыто
  const { minutes, weekend, date } = mskParts(now);
  // The derivatives weekend session is shorter than the weekday session.
  if (weekend) return kind === 'futures' && minutes >= 10 * 60 && minutes < 19 * 60;
  const open = kind === 'futures' && date >= FUTURES_EARLY_OPEN_FROM
    ? 6 * 60 + 50
    : w.open;
  return minutes >= open && minutes < w.close;
}

export function deriveStatus(args: {
  value: number | null;
  receivedAt: Date | null;
  market: MarketKind;
  now: Date;
}): QuoteStatus {
  const { value, receivedAt, market, now } = args;
  if (value === null) return 'unavailable';
  // Закрытие пока определяется по стенным часам. Точный праздничный календарь
  // остаётся отдельным ограничением: доступный ISS внутри окна считается live.
  if (!isTradingNow(market, now)) return 'closed';
  const age = receivedAt ? now.getTime() - receivedAt.getTime() : Infinity;
  return age > STALE_AFTER_MS ? 'stale' : 'live';
}

export const POLL_ACTIVE_MS = 10_000;
export const POLL_CLOSED_MS = 300_000;

/** Каденс опроса: быстрый, пока хоть один рынок жив или источник отстаёт. */
export function pollDelayMs(statuses: readonly QuoteStatus[]): number {
  return statuses.some((s) => s === 'live' || s === 'stale')
    ? POLL_ACTIVE_MS
    : POLL_CLOSED_MS;
}
