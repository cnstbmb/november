import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  binanceSymbols,
  currencySecids,
  futuresAssets,
  indexSecids,
  instrumentsByMarket,
} from './instruments';
import { anyMoexMarketOpen, isTradingNow } from './market-hours';
import {
  parseBinancePrices,
  parseCurrencyBatch,
  parseFuturesBatch,
  parseIndexQuote,
  TickInput,
} from './parsers';
import { QuoteSourcesService } from './quote-sources';
import { TickStore } from './tick-store';

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
    // Normalize to the start of the minute -> stable idempotency key.
    const ts = new Date(now);
    ts.setSeconds(0, 0);

    const ticks: TickInput[] = [];

    // ── Crypto 24/7 ──────────────────────────────────────────────────────────
    const cryptoInstruments = instrumentsByMarket('crypto');
    if (cryptoInstruments.length > 0 && isTradingNow('crypto', now)) {
      try {
        const mapping = binanceSymbols();
        const json = await this.sources.fetchBinancePrices(mapping.map((m) => m.symbol));
        ticks.push(...parseBinancePrices(json, mapping, ts));
      } catch (err) {
        this.logger.warn(`binance fetch failed: ${(err as Error).message}`);
      }
    }

    // ── MOEX (only during trading windows) ──────────────────────────────────
    if (anyMoexMarketOpen(now)) {
      // Currency batch
      if (isTradingNow('fx', now)) {
        try {
          const secids = currencySecids();
          const json = await this.sources.fetchCurrencyBatch(secids);
          const mapping = instrumentsByMarket('fx')
            .filter((i) => i.moex?.kind === 'currency')
            .map((i) => ({ id: i.id, secid: (i.moex as { secid: string }).secid }));
          ticks.push(...parseCurrencyBatch(json, mapping, ts));
        } catch (err) {
          this.logger.warn(`moex currency fetch failed: ${(err as Error).message}`);
        }
      }

      // Index
      if (isTradingNow('index', now)) {
        for (const { id, secid } of indexSecids()) {
          try {
            const json = await this.sources.fetchIndex(secid);
            const tick = parseIndexQuote(json, id, ts);
            if (tick) ticks.push(tick);
          } catch (err) {
            this.logger.warn(`moex index ${secid} fetch failed: ${(err as Error).message}`);
          }
        }
      }

      // Futures board
      if (isTradingNow('futures', now)) {
        try {
          const json = await this.sources.fetchFuturesBoard();
          ticks.push(...parseFuturesBatch(json, futuresAssets(), now, ts));
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
    this.logger.log(`collected ${written} ticks @ ${ts.toISOString()}`);
  }
}
