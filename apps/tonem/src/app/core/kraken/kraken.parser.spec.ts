import { describe, expect, it } from 'vitest';
import { parseKrakenTickerMessage } from './kraken.parser';

describe('parseKrakenTickerMessage', () => {
  it('maps a TON/USD snapshot with the exchange timestamp', () => {
    const quotes = parseKrakenTickerMessage(
      {
        channel: 'ticker',
        type: 'snapshot',
        data: [
          {
            symbol: 'TON/USD',
            last: 1.378,
            timestamp: '2026-08-06T18:58:25.636670Z',
          },
        ],
      },
      new Map([['TON/USD', 'ton']]),
    );

    expect(quotes).toHaveLength(1);
    expect(quotes[0].instrumentId).toBe('ton');
    expect(quotes[0].value).toBe(1.378);
    expect(quotes[0].systime?.toISOString()).toBe('2026-08-06T18:58:25.636Z');
  });

  it('ignores subscription acknowledgements and malformed prices', () => {
    const mapping = new Map([['TON/USD', 'ton']]);
    expect(parseKrakenTickerMessage({ method: 'subscribe', success: true }, mapping)).toEqual([]);
    expect(
      parseKrakenTickerMessage(
        {
          channel: 'ticker',
          data: [{ symbol: 'TON/USD', last: 'bad', timestamp: 'bad' }],
        },
        mapping,
      ),
    ).toEqual([]);
  });
});
