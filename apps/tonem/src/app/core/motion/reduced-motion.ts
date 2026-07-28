import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Сигнал «пользователь просит меньше движения».
 * Читает matchMedia и следит за изменением настройки на лету.
 * В окружении без matchMedia (SSR/тесты) считаем, что движение разрешено.
 */
@Injectable({ providedIn: 'root' })
export class ReducedMotion {
  private readonly state = signal(false);

  /** true — анимации (прокрутка, флеш) нужно отключить. */
  readonly enabled: Signal<boolean> = this.state.asReadonly();

  constructor() {
    if (typeof matchMedia !== 'function') return;
    const mql = matchMedia(QUERY);
    this.state.set(mql.matches);
    const onChange = (e: MediaQueryListEvent) => this.state.set(e.matches);
    mql.addEventListener?.('change', onChange);
    inject(DestroyRef).onDestroy(() => mql.removeEventListener?.('change', onChange));
  }
}
