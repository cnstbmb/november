import { QuoteStatus } from '../rates/quote.model';
import { MarketKind } from '../instruments/instrument.model';

export type { MarketKind };

/** Торговые окна в минутах от полуночи МСК (будни) */
const WINDOWS: Record<MarketKind, { open: number; close: number }> = {
  fx: { open: 6 * 60 + 50, close: 23 * 60 + 50 }, // 06:50–23:50
  futures: { open: 9 * 60, close: 23 * 60 + 50 }, // 09:00–23:50
  index: { open: 9 * 60 + 50, close: 23 * 60 + 50 }, // 09:50–23:50
};

/** Фид старше этого возраста внутри торгового окна = stale */
export const STALE_AFTER_MS = 10 * 60_000;

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
  const { minutes, weekend } = mskParts(now);
  if (weekend) return false;
  const w = WINDOWS[kind];
  return minutes >= w.open && minutes < w.close;
}

export function deriveStatus(args: {
  value: number | null;
  systime: Date | null;
  market: MarketKind;
  now: Date;
}): QuoteStatus {
  const { value, systime, market, now } = args;
  if (value === null) return 'unavailable';
  // Закрытие — по стенным часам (окну). В биржевые праздники внутри окна
  // фид молчит → получим stale ("данные задерживаются"), а не closed.
  // Известное упрощение T02; если понадобится точный календарь —
  // MOEX ISS отдаёт его отдельным endpoint'ом.
  if (!isTradingNow(market, now)) return 'closed';
  const age = systime ? now.getTime() - systime.getTime() : Infinity;
  return age > STALE_AFTER_MS ? 'stale' : 'live';
}

export const POLL_ACTIVE_MS = 10_000;
export const POLL_CLOSED_MS = 300_000;

/** Каденс опроса: быстрый, пока хоть один рынок жив */
export function pollDelayMs(statuses: readonly QuoteStatus[]): number {
  return statuses.some((s) => s === 'live' || s === 'stale')
    ? POLL_ACTIVE_MS
    : POLL_CLOSED_MS;
}
