import { Instrument, moexSecid } from './instrument.model';

/**
 * Реестр инструментов первой очереди (T02).
 * Этот же реестр позже переиспользует коллектор tonem-server.
 * Порядок = порядок в тикере по умолчанию.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'usdrub',
    label: 'USD/RUB',
    heroLabel: 'рублей за доллар',
    unit: '₽',
    decimals: 2,
    market: 'fx',
    moex: { kind: 'currency', secid: 'USD000UTSTOM' },
    cbrCode: 'USD',
  },
  {
    id: 'eurrub',
    label: 'EUR/RUB',
    heroLabel: 'рублей за евро',
    unit: '₽',
    decimals: 2,
    market: 'fx',
    moex: { kind: 'currency', secid: 'EUR_RUB__TOM' },
    cbrCode: 'EUR',
  },
  {
    id: 'cnyrub',
    label: 'CNY/RUB',
    heroLabel: 'рублей за юань',
    unit: '₽',
    decimals: 2,
    market: 'fx',
    moex: { kind: 'currency', secid: 'CNYRUB_TOM' },
    cbrCode: 'CNY',
  },
  {
    id: 'brent',
    label: 'Нефть',
    heroLabel: 'долларов за баррель',
    unit: '$',
    decimals: 2,
    market: 'futures',
    moex: { kind: 'futures', assetCode: 'BR' },
  },
  {
    id: 'gold',
    label: 'Золото',
    heroLabel: 'рублей за грамм',
    unit: '₽',
    decimals: 0,
    market: 'fx',
    moex: { kind: 'currency', secid: 'GLDRUB_TOM' },
  },
  {
    id: 'imoex',
    label: 'IMOEX',
    heroLabel: 'пунктов индекса Мосбиржи',
    unit: 'п.',
    decimals: 0,
    market: 'index',
    moex: { kind: 'index', secid: 'IMOEX' },
  },
] as const;

export const HERO_INSTRUMENT_ID = 'usdrub';

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

/** secid'ы валютного батча MOEX — одним запросом забираем все currency-инструменты */
export function currencySecids(): string[] {
  return INSTRUMENTS.filter((i) => i.moex.kind === 'currency')
    .map((i) => moexSecid(i.moex))
    .filter((s): s is string => s !== null);
}
