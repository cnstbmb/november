/**
 * Рынок инструмента — определяет торговое окно.
 * Определён здесь (а не в market-hours), чтобы реестр можно было
 * унести на бэкенд без UI-типов вроде QuoteStatus.
 */
export type MarketKind = 'fx' | 'futures' | 'index';

/** Описание источника MOEX для инструмента */
export type MoexRef =
  | { readonly kind: 'currency'; readonly secid: string }
  | { readonly kind: 'index'; readonly secid: string }
  | { readonly kind: 'futures'; readonly assetCode: string };

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
  readonly moex: MoexRef;
  /** код валюты в daily_json ЦБ (фолбэк), если применимо */
  readonly cbrCode?: string;
}
