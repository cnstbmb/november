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
});
