/**
 * Рынок инструмента — определяет торговое окно.
 * Определён здесь (а не в market-hours), чтобы реестр можно было
 * унести на бэкенд без UI-типов вроде QuoteStatus.
 * crypto — торгуется 24/7 (Binance), окна нет.
 */
export type MarketKind = 'fx' | 'futures' | 'index' | 'crypto';

/** Описание источника MOEX для инструмента */
export type MoexRef =
  | { readonly kind: 'currency'; readonly secid: string }
  | { readonly kind: 'index'; readonly secid: string }
  | {
      readonly kind: 'futures';
      readonly assetCode: string;
      /** Converts a contract quote to the unit displayed by the instrument. */
      readonly priceMultiplier?: number;
    };

/** Описание источника Binance (крипта, combined WebSocket) */
export interface BinanceRef {
  /** торговая пара: "BTCUSDT" */
  readonly symbol: string;
}

/** Kraken pair names differ between REST (TONUSD) and WebSocket (TON/USD). */
export interface KrakenRef {
  readonly pair: string;
  readonly wsSymbol: string;
}

/** Размещение в UI: live — живой тик в ленте; derived — производная, считается на лету */
export type Placement = 'live' | 'derived';

/** Типобезопасные узкие геттеры — вместо разбросанных `as`-кастов */
export function moexSecid(ref: MoexRef): string | null {
  return ref.kind === 'currency' || ref.kind === 'index' ? ref.secid : null;
}

export function moexAssetCode(ref: MoexRef): string | null {
  return ref.kind === 'futures' ? ref.assetCode : null;
}

export interface Instrument {
  /** стабильный id, используется в URL-настройках и БД */
  readonly id: string;
  /** короткая подпись в тикере: "USD/RUB" */
  readonly label: string;
  /** подпись под героем: "рублей за доллар" */
  readonly heroLabel: string;
  /** символ валюты/единицы: "₽", "$", "п." */
  readonly unit: string;
  /** знаков после запятой при форматировании */
  readonly decimals: number;
  /** рынок — определяет торговое окно */
  readonly market: MarketKind;
  /** MOEX-источник, если инструмент живёт на Мосбирже */
  readonly moex?: MoexRef;
  /** Binance-источник, если инструмент — крипта */
  readonly binance?: BinanceRef;
  /** Active Kraken USD source; Binance may remain as a historical candle source. */
  readonly kraken?: KrakenRef;
  /** Код официального курса ЦБ; live-значение приходит через tonem-server. */
  readonly cbrCode?: string;
  /** размещение: live (сырой тик) или derived (производная) */
  readonly placement: Placement;
}
