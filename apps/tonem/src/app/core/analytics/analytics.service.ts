import { DestroyRef, Injectable, inject } from '@angular/core';

export type ProductEventName =
  | 'instrument_select'
  | 'favorite_toggle'
  | 'hero_pin'
  | 'time_machine_use'
  | 'zen_toggle'
  | 'music_toggle'
  | 'pwa_install'
  | 'offline_enter';

export interface TonemAnalyticsConfig {
  readonly enabled?: boolean;
  readonly websiteId?: string;
  readonly scriptUrl?: string;
  readonly hostUrl?: string;
  readonly domains?: string;
  readonly frontendVersion?: string;
  readonly telemetryEndpoint?: string;
}

interface UmamiTracker {
  track(name: string, data?: Readonly<Record<string, string | boolean>>): void;
}

declare global {
  interface Window {
    __TONEM_ANALYTICS__?: TonemAnalyticsConfig;
    umami?: UmamiTracker;
    tonemAnalyticsBeforeSend?: (type: string, payload: unknown) => unknown;
  }
}

const EVENT_FIELDS: Readonly<Record<ProductEventName, readonly string[]>> = {
  instrument_select: ['instrument_id'],
  favorite_toggle: ['instrument_id', 'enabled'],
  hero_pin: ['instrument_id'],
  time_machine_use: [],
  zen_toggle: ['enabled'],
  music_toggle: ['enabled'],
  pwa_install: [],
  offline_enter: [],
};

const TRACKER_TIMEOUT_MS = 2_000;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly destroyRef = inject(DestroyRef);
  private initialized = false;

  initialize(): void {
    if (this.initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.initialized = true;
    const config = window.__TONEM_ANALYTICS__;
    if (!canTrack(config, navigator.doNotTrack)) return;

    window.tonemAnalyticsBeforeSend = (_type, payload) => sanitizeAnalyticsPayload(payload);

    const script = document.createElement('script');
    script.async = true;
    script.src = config?.scriptUrl ?? '/analytics/script.js';
    script.dataset['websiteId'] = config!.websiteId!;
    script.dataset['doNotTrack'] = 'true';
    script.dataset['excludeSearch'] = 'true';
    script.dataset['excludeHash'] = 'true';
    script.dataset['beforeSend'] = 'tonemAnalyticsBeforeSend';
    if (config?.hostUrl) script.dataset['hostUrl'] = config.hostUrl;
    if (config?.domains) script.dataset['domains'] = config.domains;

    let loaded = false;
    script.addEventListener('load', () => { loaded = true; }, { once: true });
    const timeout = window.setTimeout(() => {
      if (!loaded) script.remove();
    }, TRACKER_TIMEOUT_MS);
    document.head.append(script);

    const onInstalled = () => this.track('pwa_install');
    window.addEventListener('appinstalled', onInstalled);
    this.destroyRef.onDestroy(() => {
      window.clearTimeout(timeout);
      window.removeEventListener('appinstalled', onInstalled);
    });
  }

  track(name: ProductEventName, candidate: Readonly<Record<string, unknown>> = {}): void {
    if (typeof window === 'undefined' || !canTrack(window.__TONEM_ANALYTICS__, navigator.doNotTrack)) return;
    const data = productEventData(name, candidate);
    try {
      window.umami?.track(name, Object.keys(data).length > 0 ? data : undefined);
    } catch {
      // Analytics is strictly fail-open and never affects an application action.
    }
  }
}

export function sanitizeAnalyticsPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const sanitized: Record<string, unknown> = { ...payload };
  for (const field of ['url', 'referrer']) {
    if (typeof sanitized[field] === 'string') sanitized[field] = withoutUrlDetails(sanitized[field]);
  }
  if (isRecord(sanitized['payload'])) {
    sanitized['payload'] = sanitizeAnalyticsPayload(sanitized['payload']);
  }
  return sanitized;
}

function withoutUrlDetails(value: string): string {
  try {
    const url = new URL(value, 'https://tonem.ru');
    return value.startsWith('http') ? `${url.origin}${url.pathname}` : url.pathname;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canTrack(
  config: TonemAnalyticsConfig | undefined,
  doNotTrack: string | null | undefined,
): boolean {
  return config?.enabled === true && typeof config.websiteId === 'string' &&
    config.websiteId.length > 0 && doNotTrack !== '1' && doNotTrack !== 'yes';
}

export function productEventData(
  name: ProductEventName,
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string | boolean>> {
  const result: Record<string, string | boolean> = {};
  for (const field of EVENT_FIELDS[name]) {
    const value = candidate[field];
    if (field === 'instrument_id' && typeof value === 'string' && /^[a-z0-9_]{1,40}$/.test(value)) {
      result[field] = value;
    } else if (field === 'enabled' && typeof value === 'boolean') {
      result[field] = value;
    }
  }
  return result;
}
