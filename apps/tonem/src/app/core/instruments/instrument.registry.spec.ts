import { describe, expect, it } from 'vitest';
import { instrumentById } from './instrument.registry';
import { moexAssetCode } from './instrument.model';

describe('MOEX futures registry', () => {
  it('uses ISS ASSETCODE values rather than SECID prefixes', () => {
    const expected = {
      brent: 'BR',
      wheat: 'WHEAT',
      ai95: 'AI95',
      coffee: 'COFFEE',
      oj: 'ORANGE',
      sugar: 'SUGAR',
    } as const;

    for (const [id, assetCode] of Object.entries(expected)) {
      const moex = instrumentById(id)?.moex;
      expect(moex && moexAssetCode(moex)).toBe(assetCode);
    }
  });

  it('uses the price units returned by MOEX for breakfast components', () => {
    expect(instrumentById('coffee')).toMatchObject({ unit: '$', decimals: 3 });
    expect(instrumentById('oj')).toMatchObject({ unit: '$', decimals: 3 });
    expect(instrumentById('wheat')).toMatchObject({ unit: '₽', decimals: 0 });
    expect(instrumentById('sugar')).toMatchObject({ unit: '₽', decimals: 0 });
  });

  it('uses actual USD pairs for live BTC and ETH quotes', () => {
    expect(instrumentById('btc')).toMatchObject({
      heroLabel: 'долларов за биткоин',
      unit: '$',
      kraken: { pair: 'BTCUSD', wsSymbol: 'BTC/USD' },
    });
    expect(instrumentById('eth')).toMatchObject({
      heroLabel: 'долларов за эфир',
      unit: '$',
      kraken: { pair: 'ETHUSD', wsSymbol: 'ETH/USD' },
    });
  });

  it('keeps two decimal places for IMOEX', () => {
    expect(instrumentById('imoex')).toMatchObject({ decimals: 2 });
  });

  it('does not hide meaningful precision of CNY, gold, ETH, and TON', () => {
    expect(instrumentById('cnyrub')).toMatchObject({ decimals: 4 });
    expect(instrumentById('gold')).toMatchObject({ decimals: 1 });
    expect(instrumentById('eth')).toMatchObject({ decimals: 2 });
    expect(instrumentById('ton')).toMatchObject({ decimals: 3 });
  });
});
