import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { canTrack, productEventData, sanitizeAnalyticsPayload } from './analytics.service';
import {
  canSendOperationalTelemetry,
  detectDeviceType,
  OperationalTelemetryService,
  telemetryEvent,
  TonemErrorHandler,
} from './operational-telemetry.service';

describe('privacy-safe analytics', () => {
  it('respects DNT and requires explicit runtime enablement', () => {
    const config = { enabled: true, websiteId: 'public-website-id' };
    expect(canTrack(config, '1')).toBe(false);
    expect(canTrack(config, 'yes')).toBe(false);
    expect(canTrack(config, '0')).toBe(true);
    expect(canTrack(undefined, '0')).toBe(false);
  });

  it('keeps only event-specific public fields', () => {
    expect(productEventData('favorite_toggle', {
      instrument_id: 'btc',
      enabled: true,
      date: '2026-08-12',
      user_id: 'never-store-this',
      url: '/?token=secret',
    })).toEqual({ instrument_id: 'btc', enabled: true });
    expect(productEventData('time_machine_use', { date: '2026-08-12' })).toEqual({});
  });

  it('removes query and hash values before Umami ingestion', () => {
    expect(sanitizeAnalyticsPayload({
      payload: {
        url: '/?time=secret#view=private',
        referrer: 'https://example.com/path?campaign=sensitive',
        name: 'pageview',
      },
    })).toEqual({ payload: { url: '/', referrer: 'https://example.com/path', name: 'pageview' } });
  });

  it('reduces browser failures to bounded aggregate categories', () => {
    expect(telemetryEvent('window', 'unhandled_error', 'release-42', 'desktop')).toEqual({
      source: 'window',
      error_type: 'unhandled_error',
      frontend_version: 'release-42',
      device_type: 'desktop',
    });
    expect(telemetryEvent('window', 'unhandled_error', 'bad value with spaces', 'desktop')
      .frontend_version).toBe('unknown');
    expect(detectDeviceType({ innerWidth: 390 })).toBe('mobile');
    expect(detectDeviceType({ innerWidth: 900 })).toBe('tablet');
    expect(detectDeviceType({ innerWidth: 1400 })).toBe('desktop');
  });

  it('applies DNT before operational telemetry sampling or critical overrides', () => {
    expect(canSendOperationalTelemetry(true, '1', 'unhandled_error', true)).toBe(false);
    expect(canSendOperationalTelemetry(true, 'yes', 'request_failure', true)).toBe(false);
    expect(canSendOperationalTelemetry(true, '0', 'unhandled_error', false)).toBe(true);
    expect(canSendOperationalTelemetry(true, '0', 'request_failure', false)).toBe(false);
    expect(canSendOperationalTelemetry(true, '0', 'request_failure', true)).toBe(true);
  });

  it('records Angular failures and preserves the default console error handling', () => {
    TestBed.configureTestingModule({ providers: [TonemErrorHandler] });
    const telemetry = TestBed.inject(OperationalTelemetryService);
    const record = vi.spyOn(telemetry, 'record').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('test failure');

    TestBed.inject(TonemErrorHandler).handleError(error);

    expect(record).toHaveBeenCalledWith('angular', 'unhandled_error');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
