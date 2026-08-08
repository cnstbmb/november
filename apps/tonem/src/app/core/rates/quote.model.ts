export type QuoteSource = 'moex' | 'binance' | 'kraken';

/**
 * live    — рынок торгуется, данные свежие
 * closed  — торги закрыты, показываем последнюю цену сессии
 * stale   — окно торгов открыто, но фид не обновлялся (задержка/проблемы)
 * unavailable — данных нет вовсе
 */
export type QuoteStatus = 'live' | 'closed' | 'stale' | 'unavailable' | 'historical';

/** Какая цена пришла от источника: последняя сделка или расчётная цена. */
export type QuotePriceType = 'last' | 'settlement';

/** Сырая котировка из коннектора, до вычисления статуса */
export interface RawQuote {
  readonly instrumentId: string;
  readonly value: number | null;
  /** время последней сделки (поле TIME у MOEX), null если неизвестно */
  readonly time: Date | null;
  /** время обновления биржевой строки (поле SYSTIME у MOEX), не время HTTP-ответа */
  readonly systime: Date | null;
  /** Settlement нельзя выдавать пользователю за обычную цену последней сделки. */
  readonly priceType?: QuotePriceType;
}

/** Котировка в сторе, с источником и вычисленным статусом */
export interface Quote extends RawQuote {
  readonly source: QuoteSource;
  readonly status: QuoteStatus;
  /** Когда приложение действительно получило эту котировку от её источника. */
  readonly receivedAt?: Date | null;
}

export function unavailableQuote(instrumentId: string): Quote {
  return {
    instrumentId,
    value: null,
    time: null,
    systime: null,
    source: 'moex',
    status: 'unavailable',
    receivedAt: null,
  };
}
