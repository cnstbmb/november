import { DestroyRef, Injectable, inject } from '@angular/core';
import { Subscription, catchError, forkJoin, of, timeout } from 'rxjs';
import { BackendLatestService } from '../backend/backend-latest.service';
import { INSTRUMENTS, currencySecids } from '../instruments/instrument.registry';
import { moexAssetCode, moexSecid } from '../instruments/instrument.model';
import { MoexIssService } from '../moex/moex-iss.service';
import {
  parseCurrencyBatch,
  parseFuturesBatch,
  parseIndexQuote,
} from '../moex/moex-iss.parser';
import { pollDelayMs } from '../moex/market-hours';
import { RawQuote } from './quote.model';
import { RatesStore } from './rates.store';

const FX_SECIDS = currencySecids();
export const POLL_REQUEST_TIMEOUT_MS = 8_000;

function currencyMapping(): { id: string; secid: string }[] {
  return INSTRUMENTS.filter((i) => i.moex?.kind === 'currency').flatMap((i) => {
    const secid = moexSecid(i.moex!);
    return secid ? [{ id: i.id, secid }] : [];
  });
}

function futuresAssets(): { id: string; assetCode: string; priceMultiplier?: number }[] {
  return INSTRUMENTS.filter((i) => i.moex?.kind === 'futures').flatMap((i) => {
    const assetCode = moexAssetCode(i.moex!);
    if (!assetCode) return [];
    const priceMultiplier = i.moex?.kind === 'futures' ? i.moex.priceMultiplier : undefined;
    return [{ id: i.id, assetCode, ...(priceMultiplier !== undefined ? { priceMultiplier } : {}) }];
  });
}

function indexInstrument(): { id: string; secid: string } | null {
  const inst = INSTRUMENTS.find((i) => i.moex?.kind === 'index');
  const secid = inst?.moex ? moexSecid(inst.moex) : null;
  return inst && secid ? { id: inst.id, secid } : null;
}

/**
 * Цикл опроса MOEX с каденсом из pollDelayMs:
 * быстро, пока рынки живы; раз в 5 минут, когда всё закрыто.
 * USD/EUR приходят из ближайших Si/Eu фьючерсов MOEX;
 * CNY и золото — из валютного спота MOEX.
 */
@Injectable({ providedIn: 'root' })
export class RatesPoller {
  private readonly moex = inject(MoexIssService);
  private readonly store = inject(RatesStore);
  private readonly backend = inject(BackendLatestService);
  private readonly destroyRef = inject(DestroyRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;
  private running = false;
  private generation = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    this.cycle(generation);
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this.request?.unsubscribe();
    this.request = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private cycle(generation: number): void {
    this.request = forkJoin({
      currency: this.moex.fetchCurrencyBatch(FX_SECIDS).pipe(
        timeout(POLL_REQUEST_TIMEOUT_MS),
        catchError(() => of(null)),
      ),
      index: this.moex
        .fetchIndex(indexInstrument()?.secid ?? 'IMOEX')
        .pipe(timeout(POLL_REQUEST_TIMEOUT_MS), catchError(() => of(null))),
      futures: this.moex.fetchFuturesBoard().pipe(
        timeout(POLL_REQUEST_TIMEOUT_MS),
        catchError(() => of(null)),
      ),
      backend: this.backend.fetchFallbackQuotes().pipe(
        timeout(POLL_REQUEST_TIMEOUT_MS),
        catchError(() => of({ kraken: [] })),
      ),
    }).subscribe(({ currency, index, futures, backend }) => {
      this.request = null;
      // Ответ от старого поколения после stop/start не должен трогать store.
      if (!this.running || generation !== this.generation) return;
      const now = new Date();

      const currencyQuotes = currency
        ? parseCurrencyBatch(currency, currencyMapping())
        : [];
      if (currencyQuotes.length > 0) {
        this.store.apply(currencyQuotes, 'moex', now);
      }

      const idx = indexInstrument();
      if (index !== null && idx) {
        this.store.apply([parseIndexQuote(index, idx.id)], 'moex', now);
      }

      const assets = futuresAssets();
      if (futures !== null && assets.length > 0) {
        this.store.apply(parseFuturesBatch(futures, assets, now), 'moex', now);
      }

      const fallback = backend.kraken.filter((quote) => {
        const current = this.store.quoteOf(quote.instrumentId);
        if (!current || current.source !== 'kraken' || current.value === null) return true;
        const currentTime = current.systime?.getTime() ?? Number.NEGATIVE_INFINITY;
        const fallbackTime = quote.systime?.getTime() ?? Number.NEGATIVE_INFINITY;
        return current.status === 'unavailable' || current.status === 'stale'
          || fallbackTime > currentTime;
      });
      if (fallback.length > 0) {
        this.store.apply(fallback, 'kraken', now, 'source-timestamp');
      }

      this.store.refreshStatuses(now);

      if (this.running && generation === this.generation) {
        this.timer = setTimeout(
          () => this.cycle(generation),
          pollDelayMs(this.store.statuses()),
        );
      }
    });
  }
}
