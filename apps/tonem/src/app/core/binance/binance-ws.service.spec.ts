import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { RatesStore } from '../rates/rates.store';
import { BinanceWsService } from './binance-ws.service';
import { BINANCE_SOCKET_FACTORY, BinanceSocket } from './binance.types';
import { BACKOFF_BASE_MS } from './binance-stream';

/** Управляемый мок сокета: записываем инстансы, шлём кадры и ошибки вручную. */
class MockSocket implements BinanceSocket {
  static instances: MockSocket[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    MockSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  /** Имитируем входящий miniTicker-кадр. */
  emit(symbol: string, close: string, eventMs: number): void {
    this.onmessage?.({
      data: JSON.stringify({ stream: `${symbol.toLowerCase()}@miniTicker`, data: { e: '24hrMiniTicker', E: eventMs, s: symbol, c: close } }),
    });
  }

  emitRaw(frame: unknown): void {
    this.onmessage?.({ data: frame });
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }
}

const now = () => Date.now();

describe('BinanceWsService', () => {
  let service: BinanceWsService;
  let store: RatesStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    MockSocket.instances = [];
    TestBed.configureTestingModule({
      providers: [
        RatesStore,
        BinanceWsService,
        { provide: LatestQuotesCacheService, useValue: { load: () => ({}), save: () => undefined } },
        { provide: BINANCE_SOCKET_FACTORY, useValue: (url: string) => new MockSocket(url) },
      ],
    });
    service = TestBed.inject(BinanceWsService);
    store = TestBed.inject(RatesStore);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  const socket = () => MockSocket.instances[MockSocket.instances.length - 1];

  it('подключается к combined-URL из реестра', () => {
    service.start();
    expect(MockSocket.instances).toHaveLength(1);
    expect(socket().url).toBe(
      'wss://stream.binance.com:9443/stream?streams=' +
        'btcusdt@miniTicker/ethusdt@miniTicker/tonusdt@miniTicker',
    );
  });

  it('кадр → стор: live-котировка с источником binance после троттла', () => {
    service.start();
    socket().emit('BTCUSDT', '65123.45', now());
    vi.advanceTimersByTime(500); // окно coalesce

    const q = store.quoteOf('btc');
    expect(q?.value).toBeCloseTo(65123.45, 2);
    expect(q?.source).toBe('binance');
    expect(q?.status).toBe('live'); // крипта 24/7, свежий systime
  });

  it('всплеск по одному символу склеивается: в стор попадает последняя цена', () => {
    service.start();
    socket().emit('BTCUSDT', '100', now());
    socket().emit('BTCUSDT', '200', now());
    socket().emit('BTCUSDT', '300', now());
    vi.advanceTimersByTime(500);

    expect(store.quoteOf('btc')?.value).toBe(300);
  });

  it('несколько символов в одном окне → все попадают в стор', () => {
    service.start();
    socket().emit('BTCUSDT', '65000', now());
    socket().emit('ETHUSDT', '3200', now());
    socket().emit('TONUSDT', '5.5', now());
    vi.advanceTimersByTime(500);

    expect(store.quoteOf('btc')?.value).toBe(65000);
    expect(store.quoteOf('eth')?.value).toBe(3200);
    expect(store.quoteOf('ton')?.value).toBe(5.5);
  });

  it('битый кадр не роняет стрим: следующий валидный обрабатывается', () => {
    service.start();
    socket().emitRaw('{broken json');
    socket().emit('ETHUSDT', '3200', now());
    vi.advanceTimersByTime(500);

    expect(store.quoteOf('eth')?.value).toBe(3200);
    expect(MockSocket.instances).toHaveLength(1); // reconnect не понадобился
  });

  it('reconnect с экспоненциальным backoff: 1с → 2с → 4с', () => {
    service.start();
    expect(MockSocket.instances).toHaveLength(1);

    socket().fail();
    vi.advanceTimersByTime(BACKOFF_BASE_MS - 1);
    expect(MockSocket.instances).toHaveLength(1); // ещё не переподключились
    vi.advanceTimersByTime(1);
    expect(MockSocket.instances).toHaveLength(2); // через 1с

    socket().fail();
    vi.advanceTimersByTime(2 * BACKOFF_BASE_MS);
    expect(MockSocket.instances).toHaveLength(3); // через 2с

    socket().fail();
    vi.advanceTimersByTime(4 * BACKOFF_BASE_MS);
    expect(MockSocket.instances).toHaveLength(4); // через 4с
  });

  it('после reconnect поток возобновляется без перезагрузки', () => {
    service.start();
    socket().fail();
    vi.advanceTimersByTime(BACKOFF_BASE_MS); // reconnect
    expect(MockSocket.instances).toHaveLength(2);

    socket().emit('TONUSDT', '6.1', now());
    vi.advanceTimersByTime(500);
    expect(store.quoteOf('ton')?.value).toBe(6.1);
  });

  it('закрытие сокета тоже ведёт к reconnect', () => {
    service.start();
    socket().onclose?.({ code: 1006 });
    vi.advanceTimersByTime(BACKOFF_BASE_MS);
    expect(MockSocket.instances).toHaveLength(2);
  });

  it('stop() закрывает сокет и прекращает reconnect', () => {
    service.start();
    socket().fail();
    service.stop();
    const before = MockSocket.instances.length;
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(before); // никаких новых попыток
    expect(socket().closed).toBe(true);
  });
});
