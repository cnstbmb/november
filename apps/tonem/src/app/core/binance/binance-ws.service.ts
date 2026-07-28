import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, Subscription, retry, timer } from 'rxjs';
import { RawQuote } from '../rates/quote.model';
import { RatesStore } from '../rates/rates.store';
import {
  BINANCE_SOCKET_FACTORY,
  BinanceSocket,
  BinanceSocketFactory,
} from './binance.types';
import {
  BINANCE_THROTTLE_MS,
  backoffDelayMs,
  binanceMapping,
  coalesceLatestPerKey,
  combinedStreamUrl,
  symbolToIdMap,
} from './binance-stream';
import { parseCombinedMessage } from './binance.parser';

/**
 * Живой коннектор крипты: combined WebSocket Binance (miniTicker),
 * троттлинг всплесков, автоматический reconnect с экспоненциальным backoff.
 * Зеркалит RatesPoller по форме (start/stop), но источник — push, не poll.
 *
 * Zoneless: стор обновляем напрямую из стрима — сигналы сами триггерят CD.
 */
@Injectable({ providedIn: 'root' })
export class BinanceWsService {
  private readonly store = inject(RatesStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly socketFactory: BinanceSocketFactory = inject(BINANCE_SOCKET_FACTORY);

  private readonly mapping = binanceMapping();
  private readonly symbolToId = symbolToIdMap(this.mapping);
  private readonly url = combinedStreamUrl(this.mapping);

  private subscription: Subscription | null = null;
  private running = false;

  /**
   * Холодный стрим котировок: сырой сокет → reconnect → склейка всплесков.
   * Вынесен в публичный метод, чтобы тесты могли подписаться напрямую,
   * а start() оставался тонким.
   */
  connect(): Observable<RawQuote[]> {
    return this.openSocket().pipe(
      retry({ delay: (_err, attempt) => timer(backoffDelayMs(attempt)) }),
      coalesceLatestPerKey(BINANCE_THROTTLE_MS, (q) => q.instrumentId),
    );
  }

  /** Подписаться и писать котировки в стор. Идемпотентно. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.destroyRef.onDestroy(() => this.stop());
    this.subscription = this.connect().subscribe((raws) => {
      // ответ мог прийти после stop() — стор не трогаем
      if (!this.running) return;
      this.store.apply(raws, 'binance', new Date());
    });
  }

  stop(): void {
    this.running = false;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /**
   * Один сокет как Observable<RawQuote> (по одному на кадр).
   * Ошибка/закрытие сокета → error, чтобы retry выше переподключился.
   * При отписке сокет аккуратно закрываем.
   */
  private openSocket(): Observable<RawQuote> {
    return new Observable<RawQuote>((subscriber) => {
      let socket: BinanceSocket;
      try {
        socket = this.socketFactory(this.url);
      } catch (err) {
        // нет WebSocket / не удалось создать — уходим в retry-цикл
        subscriber.error(err);
        return undefined;
      }

      socket.onmessage = (ev) => {
        let quotes: RawQuote[];
        try {
          quotes = parseCombinedMessage(ev.data, this.symbolToId);
        } catch {
          return; // битый кадр — пропускаем, стрим не роняем
        }
        for (const q of quotes) subscriber.next(q);
      };
      socket.onerror = () => subscriber.error(new Error('binance websocket error'));
      socket.onclose = () => subscriber.error(new Error('binance websocket closed'));

      return () => {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try {
          socket.close();
        } catch {
          /* сокет мог уже умереть */
        }
      };
    });
  }
}
