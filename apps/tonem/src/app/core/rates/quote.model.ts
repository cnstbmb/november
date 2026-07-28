export type QuoteSource = 'moex' | 'cbr';

/**
 * live    — рынок торгуется, данные свежие
 * closed  — торги закрыты, показываем последнюю цену сессии
 * stale   — окно торгов открыто, но фид не обновлялся (задержка/проблемы)
 * unavailable — данных нет вовсе
 */
export type QuoteStatus = 'live' | 'closed' | 'stale' | 'unavailable';

/** Сырая котировка из коннектора, до вычисления статуса */
export interface RawQuote {
  readonly instrumentId: string;
  readonly value: number | null;
  /** время последней сделки (поле TIME у MOEX), null если неизвестно */
  readonly time: Date | null;
  /** время обновления фида (поле SYSTIME у MOEX) */
  readonly systime: Date | null;
}

/** Котировка в сторе, с источником и вычисленным статусом */
export interface Quote extends RawQuote {
  readonly source: QuoteSource;
  readonly status: QuoteStatus;
}

export function unavailableQuote(instrumentId: string): Quote {
  return {
    instrumentId,
    value: null,
    time: null,
    systime: null,
    source: 'moex',
    status: 'unavailable',
  };
}
