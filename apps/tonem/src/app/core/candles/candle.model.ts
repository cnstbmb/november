/**
 * Свеча спарклайна. Для кривой достаточно close, но OHLC сохраняем —
 * он приходит почти даром из обоих источников и может пригодиться.
 */
export interface Candle {
  /** момент свечи (открытие интервала) */
  readonly ts: Date;
  readonly close: number;
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
}

/**
 * Результат загрузки внутридневной кривой.
 * session — пометка, какую сессию показываем:
 *   'current' — сегодняшняя (рынок жив, либо крипта 24/7);
 *   'last'    — последняя завершённая сессия (рынок закрыт: ночь/выходные).
 */
export interface IntradayCurve {
  readonly candles: readonly Candle[];
  readonly session: 'current' | 'last';
}
