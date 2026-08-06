import { describe, expect, it } from 'vitest';
import { Instrument } from '../instruments/instrument.model';
import { candleSource, moexMarketKind } from './candle-source';

const base: Instrument = {
  id: 'x',
  label: 'X',
  heroLabel: 'x',
  unit: '₽',
  decimals: 2,
  market: 'fx',
  placement: 'live',
};

describe('candleSource — отображение инструмента в источник/endpoint', () => {
  it('currency → currency/selt с готовым SECID', () => {
    const inst: Instrument = { ...base, moex: { kind: 'currency', secid: 'USD000UTSTOM' } };
    expect(candleSource(inst)).toEqual({
      kind: 'moex',
      engine: 'currency',
      market: 'selt',
      secid: 'USD000UTSTOM',
      assetCode: null,
    });
  });

  it('index → stock/index с готовым SECID', () => {
    const inst: Instrument = {
      ...base,
      market: 'index',
      moex: { kind: 'index', secid: 'IMOEX' },
    };
    expect(candleSource(inst)).toEqual({
      kind: 'moex',
      engine: 'stock',
      market: 'index',
      secid: 'IMOEX',
      assetCode: null,
    });
  });

  it('futures → futures/forts, SECID резолвим позже (assetCode)', () => {
    const inst: Instrument = {
      ...base,
      market: 'futures',
      moex: { kind: 'futures', assetCode: 'BR' },
    };
    expect(candleSource(inst)).toEqual({
      kind: 'moex',
      engine: 'futures',
      market: 'forts',
      secid: null,
      assetCode: 'BR',
    });
  });

  it('crypto → binance klines по символу', () => {
    const inst: Instrument = {
      ...base,
      market: 'crypto',
      binance: { symbol: 'BTCUSDT' },
    };
    expect(candleSource(inst)).toEqual({ kind: 'binance', symbol: 'BTCUSDT' });
  });

  it('TON → Kraken OHLC вместо остановленной Binance-пары', () => {
    const inst: Instrument = {
      ...base,
      market: 'crypto',
      binance: { symbol: 'TONUSDT' },
      kraken: { pair: 'TONUSD', wsSymbol: 'TON/USD' },
    };
    expect(candleSource(inst)).toEqual({ kind: 'kraken', pair: 'TONUSD' });
  });

  it('без источника (derived) → null', () => {
    expect(candleSource(base)).toBeNull();
  });
});

describe('moexMarketKind — окно для ночного правила', () => {
  it('crypto → null (окна нет)', () => {
    const inst: Instrument = { ...base, market: 'crypto', binance: { symbol: 'BTCUSDT' } };
    expect(moexMarketKind(inst)).toBeNull();
  });

  it('MOEX-инструмент → свой market', () => {
    const inst: Instrument = {
      ...base,
      market: 'futures',
      moex: { kind: 'futures', assetCode: 'BR' },
    };
    expect(moexMarketKind(inst)).toBe('futures');
  });
});
