import { describe, expect, it } from 'vitest';
import { krakenMapping, krakenSubscribeMessage } from './kraken-stream';

describe('Kraken stream mapping', () => {
  it('routes TON through the active TON/USD pair', () => {
    expect(krakenMapping()).toEqual([{ id: 'ton', pair: 'TON/USD' }]);
    expect(krakenSubscribeMessage(krakenMapping())).toEqual({
      method: 'subscribe',
      params: { channel: 'ticker', symbol: ['TON/USD'], snapshot: true },
    });
  });
});
