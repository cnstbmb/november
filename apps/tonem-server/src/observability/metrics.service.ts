import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { LIVE_INSTRUMENTS, MarketKind } from '../instruments';
import { isTradingNow } from '../market-hours';
import { TickInput } from '../parsers';

export type SourceResult = 'success' | 'failure';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequests: Counter;
  private readonly httpDuration: Histogram;
  private readonly collectorRunning: Gauge;
  private readonly collectorRuns: Counter;
  private readonly collectorDuration: Histogram;
  private readonly collectorLastCompleted: Gauge;
  private readonly sourceRequests: Counter;
  private readonly sourceDuration: Histogram;
  private readonly sourceLastSuccess: Gauge;
  private readonly quoteLastUpdate: Gauge;
  private readonly marketOpen: Gauge;
  private readonly dbReady: Gauge;
  private readonly dbChecks: Counter;
  private readonly dbCheckDuration: Histogram;
  private readonly frontendErrors: Counter;

  private lastCollectorCompletion: Date | null = null;
  private readonly lastQuoteUpdates = new Map<string, Date>();

  constructor() {
    collectDefaultMetrics({ prefix: 'tonem_', register: this.registry });

    this.httpRequests = new Counter({
      name: 'tonem_http_requests_total',
      help: 'HTTP requests handled by Tonem API.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'tonem_http_request_duration_seconds',
      help: 'Tonem API request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.collectorRunning = new Gauge({
      name: 'tonem_collector_running',
      help: 'Whether the quote collector is currently running.',
      registers: [this.registry],
    });
    this.collectorRuns = new Counter({
      name: 'tonem_collector_runs_total',
      help: 'Completed collector runs by result.',
      labelNames: ['result'],
      registers: [this.registry],
    });
    this.collectorDuration = new Histogram({
      name: 'tonem_collector_duration_seconds',
      help: 'Collector run duration in seconds.',
      labelNames: ['result'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [this.registry],
    });
    this.collectorLastCompleted = new Gauge({
      name: 'tonem_collector_last_completed_timestamp_seconds',
      help: 'Unix timestamp of the last completed collector run.',
      registers: [this.registry],
    });
    this.sourceRequests = new Counter({
      name: 'tonem_quote_source_requests_total',
      help: 'Quote source requests by result.',
      labelNames: ['source', 'result'],
      registers: [this.registry],
    });
    this.sourceDuration = new Histogram({
      name: 'tonem_quote_source_duration_seconds',
      help: 'Quote source request duration in seconds.',
      labelNames: ['source', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });
    this.sourceLastSuccess = new Gauge({
      name: 'tonem_quote_source_last_success_timestamp_seconds',
      help: 'Unix timestamp of the last successful quote source request.',
      labelNames: ['source'],
      registers: [this.registry],
    });
    this.quoteLastUpdate = new Gauge({
      name: 'tonem_quote_last_update_timestamp_seconds',
      help: 'Unix timestamp of the last persisted quote by instrument and market.',
      labelNames: ['instrument', 'market'],
      registers: [this.registry],
    });
    this.marketOpen = new Gauge({
      name: 'tonem_market_open',
      help: 'Whether a market group is currently expected to update.',
      labelNames: ['market'],
      registers: [this.registry],
      collect: () => this.recordMarketState(new Date()),
    });
    this.dbReady = new Gauge({
      name: 'tonem_db_ready',
      help: 'Whether the latest Postgres readiness check succeeded.',
      registers: [this.registry],
    });
    this.dbChecks = new Counter({
      name: 'tonem_db_readiness_checks_total',
      help: 'Postgres readiness checks by result.',
      labelNames: ['result'],
      registers: [this.registry],
    });
    this.dbCheckDuration = new Histogram({
      name: 'tonem_db_readiness_check_duration_seconds',
      help: 'Postgres readiness check duration in seconds.',
      labelNames: ['result'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.frontendErrors = new Counter({
      name: 'tonem_frontend_errors_total',
      help: 'Privacy-safe aggregated frontend errors by bounded category.',
      labelNames: ['source', 'error_type', 'frontend_version', 'device_type'],
      registers: [this.registry],
    });
    for (const instrument of LIVE_INSTRUMENTS) {
      this.quoteLastUpdate.set({ instrument: instrument.id, market: instrument.market }, 0);
    }
    this.recordMarketState(new Date());
  }

  recordHttp(method: string, route: string, statusCode: number, durationSeconds: number): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  collectorStarted(): void {
    this.collectorRunning.set(1);
  }

  collectorFinished(result: SourceResult, completedAt: Date, durationSeconds: number): void {
    this.collectorRunning.set(0);
    this.collectorRuns.inc({ result });
    this.collectorDuration.observe({ result }, durationSeconds);
    if (result === 'success') {
      this.lastCollectorCompletion = new Date(completedAt);
      this.collectorLastCompleted.set(completedAt.getTime() / 1000);
    }
  }

  recordSource(source: string, result: SourceResult, completedAt: Date, durationSeconds: number): void {
    this.sourceRequests.inc({ source, result });
    this.sourceDuration.observe({ source, result }, durationSeconds);
    if (result === 'success') {
      this.sourceLastSuccess.set({ source }, completedAt.getTime() / 1000);
    }
  }

  recordQuotes(ticks: readonly TickInput[]): void {
    for (const tick of ticks) {
      const instrument = LIVE_INSTRUMENTS.find((candidate) => candidate.id === tick.instrument);
      if (!instrument) continue;
      const updatedAt = new Date(tick.ts);
      this.lastQuoteUpdates.set(tick.instrument, updatedAt);
      this.quoteLastUpdate.set(
        { instrument: tick.instrument, market: instrument.market },
        updatedAt.getTime() / 1000,
      );
    }
  }

  recordMarketState(now: Date): void {
    for (const market of ['crypto', 'fx', 'futures', 'index'] as const) {
      this.marketOpen.set({ market }, isTradingNow(market, now) ? 1 : 0);
    }
  }

  recordDbReadiness(ready: boolean, durationSeconds: number): void {
    const result: SourceResult = ready ? 'success' : 'failure';
    this.dbReady.set(ready ? 1 : 0);
    this.dbChecks.inc({ result });
    this.dbCheckDuration.observe({ result }, durationSeconds);
  }

  recordFrontendError(
    source: string,
    errorType: string,
    frontendVersion: string,
    deviceType: string,
  ): void {
    this.frontendErrors.inc({
      source,
      error_type: errorType,
      frontend_version: frontendVersion,
      device_type: deviceType,
    });
  }

  getLastCollectorCompletion(): Date | null {
    return this.lastCollectorCompletion ? new Date(this.lastCollectorCompletion) : null;
  }

  getLastQuoteUpdate(instrumentId: string): Date | null {
    const value = this.lastQuoteUpdates.get(instrumentId);
    return value ? new Date(value) : null;
  }

  getMarketQuoteUpdates(market: MarketKind): Array<Date | null> {
    return LIVE_INSTRUMENTS.filter((instrument) => instrument.market === market).map((instrument) =>
      this.getLastQuoteUpdate(instrument.id),
    );
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
