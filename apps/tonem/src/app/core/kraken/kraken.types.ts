import { InjectionToken } from '@angular/core';

export interface KrakenSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type KrakenSocketFactory = (url: string) => KrakenSocket;

function defaultKrakenSocketFactory(url: string): KrakenSocket {
  if (typeof WebSocket !== 'function') throw new Error('WebSocket is not available');
  const ws = new WebSocket(url);
  const socket: KrakenSocket = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: (data) => ws.send(data),
    close: () => ws.close(),
  };
  ws.addEventListener('open', (event) => socket.onopen?.(event));
  ws.addEventListener('message', (event) => socket.onmessage?.({ data: event.data }));
  ws.addEventListener('error', (event) => socket.onerror?.(event));
  ws.addEventListener('close', (event) => socket.onclose?.(event));
  return socket;
}

export const KRAKEN_SOCKET_FACTORY = new InjectionToken<KrakenSocketFactory>(
  'KRAKEN_SOCKET_FACTORY',
  { providedIn: 'root', factory: () => defaultKrakenSocketFactory },
);
