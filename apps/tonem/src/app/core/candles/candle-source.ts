import { Instrument, MarketKind } from '../instruments/instrument.model';

/**
 * Сопоставление рынка инструмента торговому окну Мосбиржи.
 * Определяет, закрыт ли рынок «по стенным часам» для ночного правила.
 *
 * Рынок крипты (24/7) окна не имеет — null, всегда открыт.
 */
export function moexMarketKind(instrument: Instrument): MarketKind | null {
  if (instrument.binance) return null; // crypto: ночного правила нет
  return instrument.market; // fx | futures | index — у всех есть окно
}

/** Источник свечей для инструмента. */
export type CandleSource =
  | {
      readonly kind: 'moex';
      /** engine MOEX ISS: currency | stock | futures */
      readonly engine: string;
      /** market MOEX ISS: selt | index | forts */
      readonly market: string;
      /**
       * Для currency/index — готовый SECID.
       * Для futures — null: SECID контракта нужно сначала
       * резолвить по assetCode (см. CandlesService).
       */
      readonly secid: string | null;
      /** assetCode для futures (BR, W4, …), иначе null */
      readonly assetCode: string | null;
    }
  | { readonly kind: 'binance'; readonly symbol: string };

/**
 * Выбирает источник свечей по инструменту.
 * crypto → Binance klines; MOEX-инструмент → candles.json на нужном
 * engine/market. futures отдаёт assetCode — конкретный контракт резолвим
 * тем же правилом ближайшей экспирации, что и котировки.
 */
export function candleSource(instrument: Instrument): CandleSource | null {
  if (instrument.binance) {
    return { kind: 'binance', symbol: instrument.binance.symbol };
  }
  const moex = instrument.moex;
  if (!moex) return null;
  switch (moex.kind) {
    case 'currency':
      return { kind: 'moex', engine: 'currency', market: 'selt', secid: moex.secid, assetCode: null };
    case 'index':
      return { kind: 'moex', engine: 'stock', market: 'index', secid: moex.secid, assetCode: null };
    case 'futures':
      return { kind: 'moex', engine: 'futures', market: 'forts', secid: null, assetCode: moex.assetCode };
  }
}
