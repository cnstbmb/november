import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  binanceSymbols,
  cbrRates,
  currencySecids,
  futuresAssets,
  indexSecids,
  instrumentsByMarket,
  krakenPairs,
} from './instruments';
import { anyMoexMarketOpen, isTradingNow } from './market-hours';
import {
  parseBinancePrices,
  parseCbrDailyXml,
  parseCurrencyBatch,
  parseFuturesBatch,
  parseIndexQuote,
  parseKrakenTicker,
  TickInput,
} from './parsers';
import { QuoteSourcesService } from './quote-sources';
import { TickStore } from './tick-store';
import { MetricsService, SourceResult } from './observability/metrics.service';
import { elapsedSeconds } from './observability/time';

/**
 * Once per minute writes a tick for every LIVE instrument.
 * - MOEX instruments are only polled during their trading windows (MSK).
 * - Crypto (Binance) is collected 24/7.
 * Inserts are idempotent (upsert on (instrument, ts)), keyed to the start of
 * the current minute so a restart re-using the same minute won't duplicate.
 */
@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);
  private running = false;

  constructor(
    private readonly sources: QuoteSourcesService,
    private readonly store: TickStore,
    private readonly metrics: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async collect(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous collection still running, skipping tick');
      return;
    }
    this.running = true;
    try {
      await this.collectOnce(new Date());
    } catch (err) {
      this.logger.error(`collection failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Single collection pass. Separated from the cron wrapper for testability. */
  async collectOnce(now: Date): Promise<void> {
    const startedAt = process.hrtime.bigint();
    this.metrics.collectorStarted();
    try {
      await this.collectCycle(now);
      this.metrics.collectorFinished('success', new Date(), elapsedSeconds(startedAt));
    } catch (error) {
      this.metrics.collectorFinished('failure', new Date(), elapsedSeconds(startedAt));
      throw error;
    }
  }

  private async collectCycle(now: Date): Promise<void> {
    this.metrics.recordMarketState(now);
    // Normalize to the start of the minute -> stable idempotency key.
    const ts = new Date(now);
    ts.setSeconds(0, 0);

    const ticks: TickInput[] = [];

    // ── Official daily USD/EUR rates (same source as Yandex Finance) ─────────
    try {
      const mapping = cbrRates();
      if (mapping.length > 0) {
        ticks.push(
          ...(await this.observeSource('cbr', async () => {
            const xml = await this.sources.fetchCbrDailyXml();
            return parseCbrDailyXml(xml, mapping, ts);
          })),
        );
      }
    } catch (err) {
      this.logger.warn(`CBR fetch failed: ${(err as Error).message}`);
    }

    // ── Crypto 24/7 ──────────────────────────────────────────────────────────
    const cryptoInstruments = instrumentsByMarket('crypto');
    if (cryptoInstruments.length > 0 && isTradingNow('crypto', now)) {
      try {
        const mapping = binanceSymbols();
        if (mapping.length > 0) {
          ticks.push(
            ...(await this.observeSource('binance', async () => {
              const json = await this.sources.fetchBinancePrices(mapping.map((m) => m.symbol));
              return parseBinancePrices(json, mapping, ts);
            })),
          );
        }
      } catch (err) {
        this.logger.warn(`binance fetch failed: ${(err as Error).message}`);
      }

      for (const mapping of krakenPairs()) {
        try {
          ticks.push(
            ...(await this.observeSource('kraken', async () => {
              const json = await this.sources.fetchKrakenTicker(mapping.pair);
              return parseKrakenTicker(json, [mapping], ts);
            })),
          );
        } catch (err) {
          this.logger.warn(`kraken ${mapping.pair} fetch failed: ${(err as Error).message}`);
        }
      }
    }

    // ── MOEX (only during trading windows) ──────────────────────────────────
    if (anyMoexMarketOpen(now)) {
      // Currency batch
      if (isTradingNow('fx', now)) {
        try {
          ticks.push(
            ...(await this.observeSource('moex_currency', async () => {
              const secids = currencySecids();
              const json = await this.sources.fetchCurrencyBatch(secids);
              const mapping = instrumentsByMarket('fx')
                .filter((i) => i.moex?.kind === 'currency' && !i.cbrCode)
                .map((i) => ({ id: i.id, secid: (i.moex as { secid: string }).secid }));
              return parseCurrencyBatch(json, mapping, ts);
            })),
          );
        } catch (err) {
          this.logger.warn(`moex currency fetch failed: ${(err as Error).message}`);
        }
      }

      // Index
      if (isTradingNow('index', now)) {
        for (const { id, secid } of indexSecids()) {
          try {
            const tick = await this.observeSource('moex_index', async () => {
              const json = await this.sources.fetchIndex(secid);
              return parseIndexQuote(json, id, ts);
            });
            if (tick) ticks.push(tick);
          } catch (err) {
            this.logger.warn(`moex index ${secid} fetch failed: ${(err as Error).message}`);
          }
        }
      }

      // Futures board
      if (isTradingNow('futures', now)) {
        try {
          ticks.push(
            ...(await this.observeSource('moex_futures', async () => {
              const json = await this.sources.fetchFuturesBoard();
              return parseFuturesBatch(json, futuresAssets(), now, ts);
            })),
          );
        } catch (err) {
          this.logger.warn(`moex futures fetch failed: ${(err as Error).message}`);
        }
      }
    }

    if (ticks.length === 0) {
      this.logger.debug('no ticks collected this minute (markets closed or no data)');
      return;
    }

    const written = await this.store.saveTicks(ticks);
    this.metrics.recordQuotes(ticks);
    this.logger.log(`collected ${written} ticks @ ${ts.toISOString()}`);
  }

  private async observeSource<T>(source: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = process.hrtime.bigint();
    let result: SourceResult = 'failure';
    try {
      const value = await operation();
      result = 'success';
      return value;
    } finally {
      this.metrics.recordSource(source, result, new Date(), elapsedSeconds(startedAt));
    }
  }
}
