import { Observable, OperatorFunction } from 'rxjs';
import { INSTRUMENTS } from '../instruments/instrument.registry';

const WS_BASE = 'wss://stream.binance.com:9443/stream?streams=';

/** Каденс эмиссий наружу: склеиваем всплески тикеров в одну пачку ~раз в 500мс. */
export const BINANCE_THROTTLE_MS = 500;

/** Reconnect backoff: 1с → 2с → 4с → … → потолок 30с. */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** Сопоставление инструментов с Binance-источником: id ↔ торговая пара. */
export function binanceMapping(): { id: string; symbol: string }[] {
  return INSTRUMENTS
    .filter((i) => i.binance && !i.kraken)
    .map((i) => ({ id: i.id, symbol: i.binance!.symbol }));
}

/** Карта "BTCUSDT" → "btc" для парсера. */
export function symbolToIdMap(
  mapping: readonly { id: string; symbol: string }[],
): ReadonlyMap<string, string> {
  return new Map(mapping.map(({ id, symbol }) => [symbol, id]));
}

/** URL combined-стрима: btcusdt@miniTicker/ethusdt@miniTicker/… */
export function combinedStreamUrl(mapping: readonly { symbol: string }[]): string {
  return (
    WS_BASE + mapping.map((m) => `${m.symbol.toLowerCase()}@miniTicker`).join('/')
  );
}

/** Экспоненциальная задержка переподключения (attempt начинается с 1), с потолком. */
export function backoffDelayMs(attempt: number): number {
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(exp, BACKOFF_MAX_MS);
}

/**
 * Склейка всплесков: за окно windowMs запоминаем последнее значение на ключ
 * (latest wins), по истечении окна отдаём одну пачку. Trailing-edge:
 * первый элемент всплеска открывает окно, дальше — только обновления буфера.
 * Таймер — обычный setTimeout, поэтому оператор дружит с fake timers в тестах.
 */
export function coalesceLatestPerKey<T>(
  windowMs: number,
  key: (value: T) => string,
): OperatorFunction<T, T[]> {
  return (source) =>
    new Observable<T[]>((subscriber) => {
      const buffer = new Map<string, T>();
      let timer: ReturnType<typeof setTimeout> | null = null;

      const clearTimer = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const flush = () => {
        timer = null;
        if (buffer.size === 0) return;
        const out = [...buffer.values()];
        buffer.clear();
        subscriber.next(out);
      };

      const subscription = source.subscribe({
        next: (value) => {
          buffer.set(key(value), value);
          if (timer === null) {
            timer = setTimeout(flush, windowMs);
          }
        },
        error: (err) => {
          clearTimer();
          buffer.clear();
          subscriber.error(err);
        },
        complete: () => {
          flush();
          subscriber.complete();
        },
      });

      return () => {
        clearTimer();
        buffer.clear();
        subscription.unsubscribe();
      };
    });
}
