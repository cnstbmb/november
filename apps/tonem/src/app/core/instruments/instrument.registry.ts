import { Instrument, moexSecid } from './instrument.model';

/**
 * Реестр инструментов — единый источник правды для фронта и коллектора tonem-server.
 * Порядок = порядок в тикере по умолчанию.
 *
 * live    — сырой тик из коннектора (MOEX / Binance / ЦБ).
 * derived — производная, считается на лету из живых (DerivedEngine), не хранится в БД.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  // ── FX (MOEX CETS, фолбэк ЦБ) ─────────────────────────────────────────────
  {
    id: 'usdrub',
    label: 'USD/RUB',
    heroLabel: 'рублей за доллар',
    unit: '₽',
    decimals: 2,
    market: 'fx',
    placement: 'live',
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
    placement: 'live',
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
    placement: 'live',
    moex: { kind: 'currency', secid: 'CNYRUB_TOM' },
    cbrCode: 'CNY',
  },
  {
    id: 'gold',
    label: 'Золото',
    heroLabel: 'рублей за грамм',
    unit: '₽',
    decimals: 0,
    market: 'fx',
    placement: 'live',
    moex: { kind: 'currency', secid: 'GLDRUB_TOM' },
  },

  // ── Индекс ────────────────────────────────────────────────────────────────
  {
    id: 'imoex',
    label: 'IMOEX',
    heroLabel: 'пунктов индекса Мосбиржи',
    unit: 'п.',
    decimals: 0,
    market: 'index',
    placement: 'live',
    moex: { kind: 'index', secid: 'IMOEX' },
  },

  // ── Сырьё (MOEX FORTS / спот) ─────────────────────────────────────────────
  {
    id: 'brent',
    label: 'Нефть',
    heroLabel: 'долларов за баррель',
    unit: '$',
    decimals: 2,
    market: 'futures',
    placement: 'live',
    moex: { kind: 'futures', assetCode: 'BR' },
  },
  {
    id: 'wheat',
    label: 'Пшеница',
    heroLabel: 'долларов за центнер',
    unit: '$',
    decimals: 2,
    market: 'futures',
    placement: 'live',
    moex: { kind: 'futures', assetCode: 'WHEAT' },
  },
  {
    id: 'ai95',
    label: 'АИ-95',
    heroLabel: 'рублей за тонну',
    unit: '₽',
    decimals: 0,
    market: 'futures',
    placement: 'live',
    moex: { kind: 'futures', assetCode: 'AI95' },
  },
  {
    id: 'coffee',
    label: 'Кофе',
    heroLabel: 'долларов за фунт',
    unit: '$',
    decimals: 2,
    market: 'futures',
    placement: 'live',
    moex: { kind: 'futures', assetCode: 'COFFEE' },
  },
  {
    id: 'oj',
    label: 'Сок',
    heroLabel: 'долларов за фунт',
    unit: '$',
    decimals: 2,
    market: 'futures',
    placement: 'live',
    moex: { kind: 'futures', assetCode: 'ORANGE' },
  },
  {
    id: 'sugar',
    label: 'Сахар',
    heroLabel: 'долларов за фунт',
    unit: '$',
    decimals: 2,
    market: 'futures',
    placement: 'live',
    moex: { kind: 'futures', assetCode: 'SUGAR' },
  },

  // ── Крипта (Binance, 24/7) ────────────────────────────────────────────────
  {
    id: 'btc',
    label: 'BTC',
    heroLabel: 'долларов за биткоин',
    unit: '$',
    decimals: 0,
    market: 'crypto',
    placement: 'live',
    binance: { symbol: 'BTCUSDT' },
  },
  {
    id: 'eth',
    label: 'ETH',
    heroLabel: 'долларов за эфир',
    unit: '$',
    decimals: 0,
    market: 'crypto',
    placement: 'live',
    binance: { symbol: 'ETHUSDT' },
  },
  {
    id: 'ton',
    label: 'TON',
    heroLabel: 'долларов за тон',
    unit: '$',
    decimals: 2,
    market: 'crypto',
    placement: 'live',
    // Keep Binance only as a historical reference; live moved to Kraken.
    binance: { symbol: 'TONUSDT' },
    kraken: { pair: 'TONUSD', wsSymbol: 'TON/USD' },
  },

  // ── Производные (считаются на лету, не хранятся) ──────────────────────────
  {
    id: 'eurusd',
    label: 'EUR/USD',
    heroLabel: 'долларов за евро',
    unit: '$',
    decimals: 4,
    market: 'fx',
    placement: 'derived',
  },
  {
    id: 'btcrub',
    label: 'BTC/RUB',
    heroLabel: 'рублей за биткоин',
    unit: '₽',
    decimals: 0,
    market: 'crypto',
    placement: 'derived',
  },
  {
    id: 'btcgold',
    label: 'BTC в золоте',
    heroLabel: 'граммов золота за биткоин',
    unit: 'г',
    decimals: 2,
    market: 'crypto',
    placement: 'derived',
  },
  {
    id: 'btcoil',
    label: 'BTC в нефти',
    heroLabel: 'баррелей за биткоин',
    unit: 'бbl',
    decimals: 0,
    market: 'crypto',
    placement: 'derived',
  },
  {
    id: 'breakfast',
    label: 'Завтрак',
    heroLabel: 'индекс завтрака (кофе+сок+пшеница+сахар)',
    unit: 'п.',
    decimals: 0,
    market: 'futures',
    placement: 'derived',
  },
  {
    id: 'rublgold',
    label: '₽ в золоте',
    heroLabel: 'миллиграммов золота за рубль',
    unit: 'мг',
    decimals: 3,
    market: 'fx',
    placement: 'derived',
  },
] as const;

export const HERO_INSTRUMENT_ID = 'usdrub';

export function instrumentById(id: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

/** Только живые (сырые) инструменты — то, что ходит в коннекторы и в БД */
export function liveInstruments(): readonly Instrument[] {
  return INSTRUMENTS.filter((i) => i.placement === 'live');
}

/** secid'ы валютного батча MOEX — одним запросом забираем все currency-инструменты */
export function currencySecids(): string[] {
  return INSTRUMENTS.filter((i) => i.moex?.kind === 'currency')
    .map((i) => moexSecid(i.moex!))
    .filter((s): s is string => s !== null);
}
