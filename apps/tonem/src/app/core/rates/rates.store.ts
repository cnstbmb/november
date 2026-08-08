import { Injectable, computed, inject, signal } from '@angular/core';
import { HERO_INSTRUMENT_ID, INSTRUMENTS, instrumentById } from '../instruments/instrument.registry';
import { Instrument } from '../instruments/instrument.model';
import { Quote, QuoteSource, QuoteStatus, RawQuote, unavailableQuote } from './quote.model';
import { deriveStatus } from '../moex/market-hours';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';

export type QuoteFreshness = 'response' | 'source-timestamp';

export interface TickerEntry {
  readonly instrument: Instrument;
  readonly quote: Quote;
}

export interface RatesSnapshot {
  readonly quotes: Readonly<Record<string, Quote>>;
  readonly historicalTarget: Date | null;
}

@Injectable({ providedIn: 'root' })
export class RatesStore {
  private readonly cache = inject(LatestQuotesCacheService);
  private readonly quotesSignal = signal<Readonly<Record<string, Quote>>>(this.cache.load());
  private readonly historicalTargetSignal = signal<Date | null>(null);

  readonly historicalTarget = this.historicalTargetSignal.asReadonly();

  /** герой — USD/RUB (настраиваемость придёт в T06) */
  readonly hero = computed<TickerEntry>(() => {
    const instrument = instrumentById(HERO_INSTRUMENT_ID)!;
    return {
      instrument,
      quote: this.quotesSignal()[HERO_INSTRUMENT_ID] ?? unavailableQuote(HERO_INSTRUMENT_ID),
    };
  });

  readonly ticker = computed<readonly TickerEntry[]>(() =>
    INSTRUMENTS.map((instrument) => ({
      instrument,
      quote: this.quotesSignal()[instrument.id] ?? unavailableQuote(instrument.id),
    })),
  );

  quoteOf(id: string): Quote | undefined {
    return this.quotesSignal()[id];
  }

  /** Применить пачку сырых котировок: статус вычисляется по торговому окну */
  apply(
    raws: readonly RawQuote[],
    source: QuoteSource,
    now: Date,
    freshness: QuoteFreshness = 'response',
  ): void {
    const next: Record<string, Quote> = { ...this.quotesSignal() };
    for (const raw of raws) {
      const instrument = instrumentById(raw.instrumentId);
      if (!instrument) continue;
      const receivedAt = freshness === 'response' ? now : raw.systime;
      next[raw.instrumentId] = {
        ...raw,
        source,
        receivedAt,
        status: deriveStatus({
          value: raw.value,
          receivedAt,
          market: instrument.market,
          now,
        }),
      };
    }
    this.quotesSignal.set(next);
    this.cache.save(next);
  }

  /** Пересчитать статусы по часам, не смешивая время цены со временем ответа. */
  refreshStatuses(now: Date): void {
    if (this.historicalTargetSignal() !== null) return;
    const current = this.quotesSignal();
    const next: Record<string, Quote> = { ...current };
    let changed = false;

    for (const [instrumentId, quote] of Object.entries(current)) {
      const instrument = instrumentById(instrumentId);
      if (!instrument) continue;
      const status = deriveStatus({
        value: quote.value,
        receivedAt: quote.receivedAt ?? quote.systime,
        market: instrument.market,
        now,
      });
      if (status === quote.status) continue;
      next[instrumentId] = { ...quote, status };
      changed = true;
    }

    if (changed) this.quotesSignal.set(next);
  }

  snapshot(): RatesSnapshot {
    return {
      quotes: { ...this.quotesSignal() },
      historicalTarget: this.historicalTargetSignal(),
    };
  }

  restore(snapshot: RatesSnapshot): void {
    this.quotesSignal.set({ ...snapshot.quotes });
    this.historicalTargetSignal.set(snapshot.historicalTarget);
  }

  /** Исторические данные эфемерны и не должны попадать в live/offline-кэш. */
  applyHistorical(quotes: readonly Quote[], target: Date): void {
    const next: Record<string, Quote> = {};
    for (const quote of quotes) {
      if (!instrumentById(quote.instrumentId)) continue;
      next[quote.instrumentId] = quote;
    }
    this.quotesSignal.set(next);
    this.historicalTargetSignal.set(new Date(target));
  }

  statuses(): readonly QuoteStatus[] {
    return Object.values(this.quotesSignal()).map((q) => q.status);
  }
}
