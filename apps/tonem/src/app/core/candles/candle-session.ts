import { MarketKind } from '../instruments/instrument.model';
import { isTradingNow } from '../moex/market-hours';

/**
 * Ночное правило: решить, показывать сегодняшнюю или последнюю завершённую
 * сессию, и за какую дату (МСК) запрашивать свечи.
 *
 * now — текущий момент (в тестах подменяем «фейковым сейчас»).
 */
export interface SessionDecision {
  /** метка для компонента */
  readonly session: 'current' | 'last';
  /** дата МСК, за которую запрашиваем свечи ("2026-07-28") */
  readonly fromYmd: string;
}

const mskDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function mskYmd(d: Date): string {
  return mskDay.format(d);
}

/** Предыдущий календарный день по Москве. */
function prevMskDay(now: Date): Date {
  // сдвигаем на сутки назад в UTC — МСК-дата тоже шагнёт назад
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Решение о сессии.
 *  - crypto (market null, 24/7) — всегда сегодня, 'current'.
 *  - MOEX-рынок открыт → сегодня, 'current'.
 *  - MOEX-рынок закрыт (ночь/выходные) → последняя завершённая сессия, 'last'.
 *    Берём предыдущий МСК-день; MOEX вернёт его свечи, а если это
 *    нерабочий день (праздник/выходной) — ближайшую прошлую сессию,
 *    поэтому кривая не пустеет.
 */
export function decideSession(kind: MarketKind | null, now: Date): SessionDecision {
  if (kind === null) {
    return { session: 'current', fromYmd: mskYmd(now) };
  }
  if (isTradingNow(kind, now)) {
    return { session: 'current', fromYmd: mskYmd(now) };
  }
  return { session: 'last', fromYmd: mskYmd(prevMskDay(now)) };
}
