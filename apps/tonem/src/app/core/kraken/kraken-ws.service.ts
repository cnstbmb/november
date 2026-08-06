import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, Subscription, retry, timer } from 'rxjs';
import { backoffDelayMs, coalesceLatestPerKey } from '../binance/binance-stream';
import { RawQuote } from '../rates/quote.model';
import { RatesStore } from '../rates/rates.store';
import { parseKrakenTickerMessage } from './kraken.parser';
import { KRAKEN_WS_URL, krakenMapping, krakenSubscribeMessage } from './kraken-stream';
import { KRAKEN_SOCKET_FACTORY, KrakenSocket, KrakenSocketFactory } from './kraken.types';

@Injectable({ providedIn: 'root' })
export class KrakenWsService {
  private readonly store = inject(RatesStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly socketFactory: KrakenSocketFactory = inject(KRAKEN_SOCKET_FACTORY);
  private readonly mapping = krakenMapping();
  private readonly pairToId = new Map(this.mapping.map(({ id, pair }) => [pair, id]));
  private subscription: Subscription | null = null;
  private running = false;

  connect(): Observable<RawQuote[]> {
    return this.openSocket().pipe(
      retry({ delay: (_error, attempt) => timer(backoffDelayMs(attempt)) }),
      coalesceLatestPerKey(500, (quote) => quote.instrumentId),
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.destroyRef.onDestroy(() => this.stop());
    this.subscription = this.connect().subscribe((quotes) => {
      if (this.running) this.store.apply(quotes, 'kraken', new Date());
    });
  }

  stop(): void {
    this.running = false;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private openSocket(): Observable<RawQuote> {
    return new Observable<RawQuote>((subscriber) => {
      let socket: KrakenSocket;
      try {
        socket = this.socketFactory(KRAKEN_WS_URL);
      } catch (error) {
        subscriber.error(error);
        return undefined;
      }
      socket.onopen = () => socket.send(JSON.stringify(krakenSubscribeMessage(this.mapping)));
      socket.onmessage = (event) => {
        for (const quote of parseKrakenTickerMessage(event.data, this.pairToId)) {
          subscriber.next(quote);
        }
      };
      socket.onerror = () => subscriber.error(new Error('kraken websocket error'));
      socket.onclose = () => subscriber.error(new Error('kraken websocket closed'));
      return () => {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try {
          socket.close();
        } catch {
          /* already closed */
        }
      };
    });
  }
}
