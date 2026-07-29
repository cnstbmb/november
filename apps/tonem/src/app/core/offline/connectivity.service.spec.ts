import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectivityService } from './connectivity.service';

describe('ConnectivityService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('exposes navigator state and follows online/offline browser events', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const service = TestBed.inject(ConnectivityService);

    expect(service.online()).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);
  });

  it('removes both browser listeners when its injector is destroyed', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    TestBed.inject(ConnectivityService);

    TestBed.resetTestingModule();

    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
