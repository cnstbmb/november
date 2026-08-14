import { DestroyRef, ErrorHandler, Injectable, inject } from '@angular/core';

type TelemetrySource = 'angular' | 'window' | 'promise' | 'resource' | 'service_worker' | 'network';
export type ErrorType =
  | 'unhandled_error'
  | 'unhandled_rejection'
  | 'resource_load'
  | 'service_worker_error'
  | 'request_failure';
type DeviceType = 'desktop' | 'tablet' | 'mobile' | 'unknown';

interface TelemetryEvent {
  readonly source: TelemetrySource;
  readonly error_type: ErrorType;
  readonly frontend_version: string;
  readonly device_type: DeviceType;
}

const CRITICAL_TYPES = new Set<ErrorType>([
  'unhandled_error',
  'unhandled_rejection',
  'service_worker_error',
]);
const MAX_BATCH = 10;
const MAX_BATCHES_PER_MINUTE = 10;
const FLUSH_DELAY_MS = 2_000;

@Injectable({ providedIn: 'root' })
export class OperationalTelemetryService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly sampledSession = randomSample() < 0.1;
  private readonly queue: TelemetryEvent[] = [];
  private flushTimer: number | null = null;
  private minuteStartedAt = Date.now();
  private batchesThisMinute = 0;
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    const onError = (event: ErrorEvent | Event) => {
      const resourceFailure = !(event instanceof ErrorEvent) || event.error === undefined;
      this.record(resourceFailure ? 'resource' : 'window', resourceFailure ? 'resource_load' : 'unhandled_error');
    };
    const onRejection = () => this.record('promise', 'unhandled_rejection');
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
      if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    });
  }

  record(source: TelemetrySource, errorType: ErrorType): void {
    if (typeof window === 'undefined') return;
    const config = window.__TONEM_ANALYTICS__;
    if (!canSendOperationalTelemetry(
      config?.enabled === true,
      navigator.doNotTrack,
      errorType,
      this.sampledSession,
    )) return;
    const event = telemetryEvent(
      source,
      errorType,
      config?.frontendVersion ?? 'unknown',
      detectDeviceType(window),
    );
    this.queue.push(event);
    if (this.queue.length >= MAX_BATCH) this.flush();
    else if (this.flushTimer === null) {
      this.flushTimer = window.setTimeout(() => this.flush(), FLUSH_DELAY_MS);
    }
  }

  private flush(): void {
    if (typeof window === 'undefined' || this.queue.length === 0) return;
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const now = Date.now();
    if (now - this.minuteStartedAt >= 60_000) {
      this.minuteStartedAt = now;
      this.batchesThisMinute = 0;
    }
    if (this.batchesThisMinute >= MAX_BATCHES_PER_MINUTE) {
      this.queue.length = 0;
      return;
    }
    this.batchesThisMinute += 1;
    const events = this.queue.splice(0, MAX_BATCH);
    const endpoint = window.__TONEM_ANALYTICS__?.telemetryEndpoint ?? '/client-telemetry';
    const body = JSON.stringify({ events });
    try {
      if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return;
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(1_000) : undefined,
      }).catch(() => undefined);
    } catch {
      // Operational telemetry is also fail-open and is never retried.
    }
  }
}

export function canSendOperationalTelemetry(
  enabled: boolean,
  doNotTrack: string | null | undefined,
  errorType: ErrorType,
  sampledSession: boolean,
): boolean {
  if (!enabled || doNotTrack === '1' || doNotTrack === 'yes') return false;
  return CRITICAL_TYPES.has(errorType) || sampledSession;
}

@Injectable()
export class TonemErrorHandler extends ErrorHandler {
  private readonly telemetry = inject(OperationalTelemetryService);

  override handleError(error: unknown): void {
    this.telemetry.record('angular', 'unhandled_error');
    super.handleError(error);
  }
}

export function telemetryEvent(
  source: TelemetrySource,
  errorType: ErrorType,
  frontendVersion: string,
  deviceType: DeviceType,
): TelemetryEvent {
  return {
    source,
    error_type: errorType,
    frontend_version: /^[a-zA-Z0-9._-]{1,40}$/.test(frontendVersion) ? frontendVersion : 'unknown',
    device_type: deviceType,
  };
}

export function detectDeviceType(target: Pick<Window, 'innerWidth'>): DeviceType {
  if (!Number.isFinite(target.innerWidth)) return 'unknown';
  if (target.innerWidth < 768) return 'mobile';
  if (target.innerWidth < 1100) return 'tablet';
  return 'desktop';
}

function randomSample(): number {
  try {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 0x1_0000_0000;
  } catch {
    return Math.random();
  }
}
