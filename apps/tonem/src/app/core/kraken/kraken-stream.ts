import { INSTRUMENTS } from '../instruments/instrument.registry';

export const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2';

export function krakenMapping(): { id: string; pair: string }[] {
  return INSTRUMENTS.filter((instrument) => instrument.kraken).map((instrument) => ({
    id: instrument.id,
    pair: instrument.kraken!.wsSymbol,
  }));
}

export function krakenSubscribeMessage(mapping: readonly { pair: string }[]): unknown {
  return {
    method: 'subscribe',
    params: {
      channel: 'ticker',
      symbol: mapping.map(({ pair }) => pair),
      snapshot: true,
    },
  };
}
