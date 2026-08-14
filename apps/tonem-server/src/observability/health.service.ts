import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { isTradingNow } from '../market-hours';
import { MarketKind } from '../instruments';
import { PrismaService } from '../prisma.service';
import { MetricsService } from './metrics.service';
import { elapsedSeconds } from './time';

export type CheckState = 'ok' | 'unhealthy' | 'closed';

export interface HealthSnapshot {
  status: 'ok' | 'unhealthy';
  checks: {
    collector: CheckState;
    crypto: CheckState;
    fx: CheckState;
    futures: CheckState;
    index: CheckState;
  };
}

const COLLECTOR_MAX_AGE_MS = 3 * 60 * 1000;
const CRYPTO_MAX_AGE_MS = 5 * 60 * 1000;
const MOEX_MAX_AGE_MS = 10 * 60 * 1000;

@Injectable()
export class HealthService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.isReady();
  }

  async isReady(): Promise<boolean> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.metrics.recordDbReadiness(true, elapsedSeconds(startedAt));
      return true;
    } catch {
      this.metrics.recordDbReadiness(false, elapsedSeconds(startedAt));
      return false;
    }
  }

  @Interval(30_000)
  async refreshReadinessMetric(): Promise<void> {
    await this.isReady();
  }

  snapshot(now = new Date()): HealthSnapshot {
    const collector: CheckState = this.isFresh(this.metrics.getLastCollectorCompletion(), now, COLLECTOR_MAX_AGE_MS)
      ? 'ok'
      : 'unhealthy';
    const crypto = this.marketState('crypto', now, CRYPTO_MAX_AGE_MS, false);
    const fx = this.marketState('fx', now, MOEX_MAX_AGE_MS, true);
    const futures = this.marketState('futures', now, MOEX_MAX_AGE_MS, true);
    const index = this.marketState('index', now, MOEX_MAX_AGE_MS, true);
    const checks = { collector, crypto, fx, futures, index };

    return {
      status: Object.values(checks).some((state) => state === 'unhealthy') ? 'unhealthy' : 'ok',
      checks,
    };
  }

  private marketState(
    market: MarketKind,
    now: Date,
    maxAgeMs: number,
    tradingHoursAware: boolean,
  ): CheckState {
    if (tradingHoursAware && !isTradingNow(market, now)) return 'closed';
    const updates = this.metrics.getMarketQuoteUpdates(market);
    return updates.some((updatedAt) => this.isFresh(updatedAt, now, maxAgeMs)) ? 'ok' : 'unhealthy';
  }

  private isFresh(value: Date | null, now: Date, maxAgeMs: number): boolean {
    return value !== null && now.getTime() - value.getTime() <= maxAgeMs;
  }
}
