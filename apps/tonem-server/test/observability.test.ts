import { describe, expect, it, vi } from 'vitest';
import { HealthService } from '../src/observability/health.service';
import { JsonLogger } from '../src/observability/json-logger';
import { MetricsService } from '../src/observability/metrics.service';
import { metricRoute } from '../src/observability/request-observability.middleware';
import { PrismaService } from '../src/prisma.service';
import { parseTelemetryBatch } from '../src/observability/client-telemetry.controller';
import {
  parseAnalyticsBatch,
  parseAnalyticsRequest,
} from '../src/observability/analytics-ingest.controller';

describe('MetricsService', () => {
  it('exports bounded HTTP, collector, source and quote metrics', async () => {
    const metrics = new MetricsService();
    const now = new Date('2026-08-11T10:00:00.000Z');

    metrics.recordHttp('GET', '/health', 200, 0.025);
    metrics.collectorStarted();
    metrics.recordSource('kraken', 'success', now, 0.15);
    metrics.recordDbReadiness(true, 0.005);
    metrics.recordFrontendError('angular', 'unhandled_error', '2026.08.11', 'desktop');
    metrics.recordQuotes([{ instrument: 'btc', ts: now, value: 1 }]);
    metrics.collectorFinished('success', now, 0.5);

    const output = await metrics.metrics();
    expect(output).toContain('tonem_http_requests_total{method="GET",route="/health",status_code="200"} 1');
    expect(output).toContain('tonem_collector_last_completed_timestamp_seconds');
    expect(output).toContain('tonem_quote_source_requests_total{source="kraken",result="success"} 1');
    expect(output).toContain('tonem_quote_last_update_timestamp_seconds{instrument="btc",market="crypto"}');
    expect(output).toContain('tonem_db_ready 1');
    expect(output).toContain('tonem_frontend_errors_total{source="angular",error_type="unhandled_error",frontend_version="2026.08.11",device_type="desktop"} 1');
  });

  it('rejects telemetry with unknown fields instead of silently accepting it', () => {
    expect(() => parseTelemetryBatch({ events: [
      {
        source: 'window',
        error_type: 'unhandled_error',
        frontend_version: '2026.08.11',
        device_type: 'mobile',
        message: 'contains user data',
        stack: 'secret stack',
        url: 'https://tonem.ru/?token=secret',
      },
      { source: 'custom', error_type: 'anything', frontend_version: 'x', device_type: 'watch' },
    ] })).toThrow('Invalid telemetry event');
  });

  it('accepts a complete bounded telemetry batch', () => {
    expect(parseTelemetryBatch({ events: [{
      source: 'window',
      error_type: 'unhandled_error',
      frontend_version: '2026.08.11',
      device_type: 'mobile',
    }] })).toEqual([{
      source: 'window',
      error_type: 'unhandled_error',
      frontend_version: '2026.08.11',
      device_type: 'mobile',
    }]);
    expect(() => parseTelemetryBatch({ events: [] })).toThrow('Invalid telemetry batch size');
  });
});

describe('analytics ingestion allowlist', () => {
  const website = 'bdab8c3c-5643-4045-95af-0ce95c104ab9';

  it('sanitizes page URLs server-side', () => {
    expect(parseAnalyticsRequest({
      type: 'event',
      payload: {
        website,
        hostname: 'tonem.ru',
        url: '/?token=secret#private',
        referrer: 'https://example.com/source?campaign=secret',
      },
    })).toEqual({
      type: 'event',
      payload: {
        website,
        hostname: 'tonem.ru',
        url: '/',
        referrer: 'https://example.com/source',
      },
    });
  });

  it('accepts only named product events with their exact fields', () => {
    expect(parseAnalyticsRequest({
      type: 'event',
      payload: { website, name: 'favorite_toggle', data: { instrument_id: 'btc', enabled: true } },
    }).payload.data).toEqual({ instrument_id: 'btc', enabled: true });

    expect(() => parseAnalyticsRequest({
      type: 'event',
      payload: { website, name: 'favorite_toggle', data: { instrument_id: 'btc', enabled: true, token: 'x' } },
    })).toThrow('Invalid analytics payload');
    expect(() => parseAnalyticsRequest({
      type: 'identify',
      payload: { website, data: { user_id: 'private' } },
    })).toThrow('Invalid analytics payload');
    expect(() => parseAnalyticsRequest({
      type: 'event',
      payload: { website, name: 'unapproved_event', data: {} },
    })).toThrow('Invalid analytics payload');
  });

  it('validates every item and bounds batches', () => {
    expect(parseAnalyticsBatch([{ type: 'event', payload: { website } }])).toHaveLength(1);
    expect(() => parseAnalyticsBatch([])).toThrow('Invalid analytics payload');
    expect(() => parseAnalyticsBatch([{ type: 'event', payload: { website, unexpected: true } }]))
      .toThrow('Invalid analytics payload');
  });
});

describe('HealthService', () => {
  it('reports healthy crypto and ignores closed MOEX groups', () => {
    const metrics = new MetricsService();
    const now = new Date('2026-08-01T17:00:00.000Z'); // Saturday, 20:00 MSK
    metrics.collectorFinished('success', now, 0.2);
    metrics.recordQuotes([{ instrument: 'btc', ts: now, value: 1 }]);
    const health = new HealthService({} as PrismaService, metrics);

    expect(health.snapshot(now)).toEqual({
      status: 'ok',
      checks: { collector: 'ok', crypto: 'ok', fx: 'closed', futures: 'closed', index: 'closed' },
    });
  });

  it('reports stale collector and crypto as unhealthy', () => {
    const health = new HealthService({} as PrismaService, new MetricsService());
    const snapshot = health.snapshot(new Date('2026-08-01T17:00:00.000Z'));
    expect(snapshot.status).toBe('unhealthy');
    expect(snapshot.checks.collector).toBe('unhealthy');
    expect(snapshot.checks.crypto).toBe('unhealthy');
  });

  it('checks Postgres readiness without exposing the database error', async () => {
    const readyPrisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } as unknown as PrismaService;
    const failedPrisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('secret database detail')) } as unknown as PrismaService;

    await expect(new HealthService(readyPrisma, new MetricsService()).isReady()).resolves.toBe(true);
    await expect(new HealthService(failedPrisma, new MetricsService()).isReady()).resolves.toBe(false);
  });
});

describe('request observability', () => {
  it('uses a fixed route allowlist and never stores arbitrary paths', () => {
    expect(metricRoute('/latest')).toBe('/latest');
    expect(metricRoute('/users/123?token=secret')).toBe('other');
  });

  it('writes structured JSON', () => {
    const logger = new JsonLogger();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.log({ event: 'test', requestId: 'request-only' }, 'ObservabilityTest');
    const entry = JSON.parse(String(consoleSpy.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'log', context: 'ObservabilityTest', event: 'test' });
    expect(entry.timestamp).toEqual(expect.any(String));
    consoleSpy.mockRestore();
  });

  it('does not emit stack traces', () => {
    const logger = new JsonLogger();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.error('failed', 'stack containing user data', 'ObservabilityTest');
    const entry = JSON.parse(String(consoleSpy.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).not.toHaveProperty('trace');
    expect(JSON.stringify(entry)).not.toContain('stack containing user data');
    consoleSpy.mockRestore();
  });
});
