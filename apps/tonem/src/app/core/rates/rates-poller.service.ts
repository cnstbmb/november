import { DestroyRef, Injectable, inject } from '@angular/core';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { INSTRUMENTS, currencySecids } from '../instruments/instrument.registry';
import { moexAssetCode, moexSecid } from '../instruments/instrument.model';
import { MoexIssService } from '../moex/moex-iss.service';
import {
  parseCurrencyBatch,
  parseFuturesBatch,
  parseIndexQuote,
} from '../moex/moex-iss.parser';
import { pollDelayMs } from '../moex/market-hours';
import { CbrService } from '../cbr/cbr.service';
import { parseCbrDaily } from '../cbr/cbr.parser';
import { RawQuote } from './quote.model';
import { RatesStore } from './rates.store';

const FX_SECIDS = currencySecids();

function currencyMapping(): { id: string; secid: string }[] {
  return INSTRUMENTS.filter((i) => i.moex?.kind === 'currency').flatMap((i) => {
    const secid = moexSecid(i.moex!);
    return secid ? [{ id: i.id, secid }] : [];
  });
}

function futuresAssets(): { id: string; assetCode: string }[] {
  return INSTRUMENTS.filter((i) => i.moex?.kind === 'futures').flatMap((i) => {
    const assetCode = moexAssetCode(i.moex!);
    return assetCode ? [{ id: i.id, assetCode }] : [];
  });
}

function indexInstrument(): { id: string; secid: string } | null {
  const inst = INSTRUMENTS.find((i) => i.moex?.kind === 'index');
  const secid = inst?.moex ? moexSecid(inst.moex) : null;
  return inst && secid ? { id: inst.id, secid } : null;
}

function hasAnyValue(quotes: readonly RawQuote[]): boolean {
  return quotes.some((q) => q.value !== null);
}

/**
 * Цикл опроса MOEX с каденсом из pollDelayMs:
 * быстро, пока рынки живы; раз в 5 минут, когда всё закрыто.
 * Фолбэк на ЦБ — если валютный батч упал ИЛИ вернулся пустым
 * (MOEX в maintenance отвечает 200 с пустым marketdata).
 */
@Injectable({ providedIn: 'root' })
export class RatesPoller {
  private readonly moex = inject(MoexIssService);
  private readonly cbr = inject(CbrService);
  private readonly store = inject(RatesStore);
  private readonly destroyRef = inject(DestroyRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;
  private cbrRequest: Subscription | null = null;
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
    this.cbrRequest?.unsubscribe();
    this.cbrRequest = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private cycle(generation: number): void {
    this.request = forkJoin({
      currency: this.moex.fetchCurrencyBatch(FX_SECIDS).pipe(catchError(() => of(null))),
      index: this.moex
        .fetchIndex(indexInstrument()?.secid ?? 'IMOEX')
        .pipe(catchError(() => of(null))),
      futures: this.moex.fetchFuturesBoard().pipe(catchError(() => of(null))),
    }).subscribe(({ currency, index, futures }) => {
      this.request = null;
      // Ответ от старого поколения после stop/start не должен трогать store.
      if (!this.running || generation !== this.generation) return;
      const now = new Date();

      const currencyQuotes = currency
        ? parseCurrencyBatch(currency, currencyMapping())
        : [];
      if (hasAnyValue(currencyQuotes)) {
        this.store.apply(currencyQuotes, 'moex', now);
      } else {
        this.applyCbrFallback(now, generation);
      }

      const idx = indexInstrument();
      if (index !== null && idx) {
        this.store.apply([parseIndexQuote(index, idx.id)], 'moex', now);
      }

      const assets = futuresAssets();
      if (futures !== null && assets.length > 0) {
        this.store.apply(parseFuturesBatch(futures, assets, now), 'moex', now);
      }

      if (this.running && generation === this.generation) {
        this.timer = setTimeout(
          () => this.cycle(generation),
          pollDelayMs(this.store.statuses()),
        );
      }
    });
  }

  private applyCbrFallback(now: Date, generation: number): void {
    const mapping = INSTRUMENTS.filter((i) => i.cbrCode).map((i) => ({
      id: i.id,
      cbrCode: i.cbrCode!,
    }));
    if (mapping.length === 0) return;
    this.cbrRequest = this.cbr
      .fetchDaily()
      .pipe(catchError(() => of(null)))
      .subscribe((json) => {
        this.cbrRequest = null;
        if (json && this.running && generation === this.generation) {
          this.store.apply(parseCbrDaily(json, mapping), 'cbr', now);
        }
      });
  }
}
