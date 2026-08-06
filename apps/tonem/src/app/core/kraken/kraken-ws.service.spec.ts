import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { RatesStore } from '../rates/rates.store';
import { KrakenWsService } from './kraken-ws.service';
import { KRAKEN_WS_URL } from './kraken-stream';
import { KRAKEN_SOCKET_FACTORY, KrakenSocket } from './kraken.types';

class MockKrakenSocket implements KrakenSocket {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

describe('KrakenWsService', () => {
  let socket: MockKrakenSocket;
  let service: KrakenWsService;
  let store: RatesStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T18:58:26.000Z'));
    TestBed.configureTestingModule({
      providers: [
        KrakenWsService,
        RatesStore,
        {
          provide: LatestQuotesCacheService,
          useValue: { load: () => ({}), save: () => undefined },
        },
        {
          provide: KRAKEN_SOCKET_FACTORY,
          useValue: (url: string) => (socket = new MockKrakenSocket(url)),
        },
      ],
    });
    service = TestBed.inject(KrakenWsService);
    store = TestBed.inject(RatesStore);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('subscribes to TON/USD and applies a fresh Kraken quote', () => {
    service.start();
    expect(socket.url).toBe(KRAKEN_WS_URL);
    socket.onopen?.({});
    expect(JSON.parse(socket.sent[0])).toEqual({
      method: 'subscribe',
      params: { channel: 'ticker', symbol: ['TON/USD'], snapshot: true },
    });

    socket.onmessage?.({
      data: JSON.stringify({
        channel: 'ticker',
        type: 'snapshot',
        data: [{ symbol: 'TON/USD', last: 1.378, timestamp: '2026-08-06T18:58:25.636Z' }],
      }),
    });
    vi.advanceTimersByTime(500);

    expect(store.quoteOf('ton')?.value).toBe(1.378);
    expect(store.quoteOf('ton')?.source).toBe('kraken');
    expect(store.quoteOf('ton')?.status).toBe('live');
  });
});
