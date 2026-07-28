import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReducedMotion } from './reduced-motion';

type ChangeHandler = (e: MediaQueryListEvent) => void;

function stubMatchMedia(matches: boolean) {
  let handler: ChangeHandler | null = null;
  const mql = {
    matches,
    addEventListener: (_: string, h: ChangeHandler) => {
      handler = h;
    },
    removeEventListener: () => {
      handler = null;
    },
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return {
    mql,
    fire(next: boolean) {
      handler?.({ matches: next } as MediaQueryListEvent);
    },
  };
}

describe('ReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('без matchMedia — движение разрешено (false)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const rm = TestBed.runInInjectionContext(() => new ReducedMotion());
    expect(rm.enabled()).toBe(false);
  });

  it('читает начальное состояние из matchMedia', () => {
    stubMatchMedia(true);
    const rm = TestBed.runInInjectionContext(() => new ReducedMotion());
    expect(rm.enabled()).toBe(true);
  });

  it('реагирует на смену настройки на лету', () => {
    const stub = stubMatchMedia(false);
    const rm = TestBed.runInInjectionContext(() => new ReducedMotion());
    expect(rm.enabled()).toBe(false);
    stub.fire(true);
    expect(rm.enabled()).toBe(true);
  });
});
