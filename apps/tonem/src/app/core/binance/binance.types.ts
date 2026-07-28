import { InjectionToken } from '@angular/core';

/**
 * Минимальное окружение WebSocket, нужное коннектору.
 * Нарочно не используем тип DOM WebSocket напрямую — так сокет
 * можно подменить моком в тестах (см. binance-ws.service.spec).
 */
export interface BinanceSocket {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { readonly data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  close(): void;
}

export type BinanceSocketFactory = (url: string) => BinanceSocket;

/**
 * Адаптер над нативным WebSocket: навешивает обработчики через addEventListener
 * и пробрасывает их в поля BinanceSocket. Бросает понятную ошибку там,
 * где WebSocket недоступен (SSR / старые браузеры) — коннектор её поймает
 * и уйдёт в reconnect-цикл, не уронив приложение.
 */
function defaultBinanceSocketFactory(url: string): BinanceSocket {
  if (typeof WebSocket !== 'function') {
    throw new Error('WebSocket is not available in this environment');
  }
  const ws = new WebSocket(url);
  const socket: BinanceSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    close: () => ws.close(),
  };
  ws.addEventListener('open', (e) => socket.onopen?.(e));
  ws.addEventListener('message', (e) => socket.onmessage?.({ data: e.data }));
  ws.addEventListener('error', (e) => socket.onerror?.(e));
  ws.addEventListener('close', (e) => socket.onclose?.(e));
  return socket;
}

/** Фабрика сокетов — точка подмены для тестов и нестандартных окружений. */
export const BINANCE_SOCKET_FACTORY = new InjectionToken<BinanceSocketFactory>(
  'BinanceSocketFactory',
  { providedIn: 'root', factory: () => defaultBinanceSocketFactory },
);
