import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly onlineState = signal(readInitialOnlineState());
  private readonly eventTarget = browserWindow();
  private readonly onlineListener = () => this.onlineState.set(true);
  private readonly offlineListener = () => this.onlineState.set(false);

  readonly online: Signal<boolean> = this.onlineState.asReadonly();
  readonly isOnline = this.online;

  constructor() {
    this.eventTarget?.addEventListener('online', this.onlineListener);
    this.eventTarget?.addEventListener('offline', this.offlineListener);
    this.destroyRef.onDestroy(() => {
      this.eventTarget?.removeEventListener('online', this.onlineListener);
      this.eventTarget?.removeEventListener('offline', this.offlineListener);
    });
  }
}

function readInitialOnlineState(): boolean {
  try {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } catch {
    return true;
  }
}

function browserWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}
