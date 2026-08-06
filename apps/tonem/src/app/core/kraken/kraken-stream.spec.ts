import { describe, expect, it } from 'vitest';
import { krakenMapping, krakenSubscribeMessage } from './kraken-stream';

describe('Kraken stream mapping', () => {
  it('routes all live crypto through actual Kraken USD pairs', () => {
    expect(krakenMapping()).toEqual([
      { id: 'btc', pair: 'BTC/USD' },
      { id: 'eth', pair: 'ETH/USD' },
      { id: 'ton', pair: 'TON/USD' },
    ]);
    expect(krakenSubscribeMessage(krakenMapping())).toEqual({
      method: 'subscribe',
      params: { channel: 'ticker', symbol: ['BTC/USD', 'ETH/USD', 'TON/USD'], snapshot: true },
    });
  });
});
