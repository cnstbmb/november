import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, Subject, catchError, finalize, forkJoin, map, switchMap, tap } from 'rxjs';
import { BinanceWsService } from '../binance/binance-ws.service';
import { liveInstruments } from '../instruments/instrument.registry';
import { MoodEngine, MoodSnapshot } from '../mood/mood.engine';
import { Quote, QuoteSource } from '../rates/quote.model';
import { RatesPoller } from '../rates/rates-poller.service';
import { RatesSnapshot, RatesStore } from '../rates/rates.store';
import { VIEW_SETTINGS_PLATFORM } from '../view-settings/view-settings.platform';
import { HistoricalEntry, HistoricalSnapshot } from './time-machine.model';
import { canonicalTimeUrl, hasTimeTargetParam, timeTargetFromUrl } from './time-machine-url';

const HISTORICAL_BASELINE_MS = 24 * 60 * 60 * 1000;

export const TIME_MACHINE_API_BASE = new InjectionToken<string>('TIME_MACHINE_API_BASE', {
  providedIn: 'root',
  factory: () => 'https://api.tonem.ru',
});

interface AtResponseEntryDto {
  readonly ts: string;
  readonly value: number;
  readonly meta: unknown;
}

type AtResponseDto = Readonly<Record<string, AtResponseEntryDto | null>>;



interface Transition {
  readonly target: Date | null;
  readonly writeUrl: boolean;
}

interface HistoricalPair {
  readonly baseline: HistoricalSnapshot;
  readonly current: HistoricalSnapshot;
}

export type TimeStep = 'day' | 'week' | 'month';

export function historicalTargetFrom(now: Date, unit: TimeStep): Date {
  const target = new Date(now);
  switch (unit) {
    case 'day':
      target.setDate(target.getDate() - 1);
      break;
    case 'week':
      target.setDate(target.getDate() - 7);
      break;
    case 'month': {
      const originalDay = target.getDate();
      target.setDate(1);
      target.setMonth(target.getMonth() - 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(originalDay, lastDay));
      break;
    }
  }
  return target;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates the backend contract: Record<instrumentId, Entry | null>. */
export function parseAtResponse(value: unknown): HistoricalSnapshot | null {
  if (!isRecord(value)) return null;

  const parsed: Record<string, HistoricalEntry | null> = {};
  for (const [instrumentId, candidate] of Object.entries(value as AtResponseDto)) {
    if (candidate === null) {
      parsed[instrumentId] = null;
      continue;
    }
    if (!isRecord(candidate)) return null;

    const ts = candidate['ts'];
    const entryValue = candidate['value'];
    if (typeof ts !== 'string' || typeof entryValue !== 'number' || !Number.isFinite(entryValue)) {
      return null;
    }
    const timestamp = Date.parse(ts);
    if (!Number.isFinite(timestamp)) return null;
    parsed[instrumentId] = { ts: new Date(timestamp), value: entryValue };
  }
  return liveInstruments().every((instrument) => Object.hasOwn(parsed, instrument.id))
    ? parsed
    : null;
}

/**
 * Единственный владелец lifecycle live/history. Любой переход проходит через
 * switchMap: старые HTTP-запросы отменяются, а request id страхует от источника,
 * который проигнорировал отписку.
 */
@Injectable({ providedIn: 'root' })
export class TimeMachineService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(RatesStore);
  private readonly poller = inject(RatesPoller);
  private readonly binance = inject(BinanceWsService);
  private readonly mood = inject(MoodEngine);
  private readonly platform = inject(VIEW_SETTINGS_PLATFORM);
  private readonly apiBase = inject(TIME_MACHINE_API_BASE).replace(/\/$/, '');
  private readonly destroyRef = inject(DestroyRef);

  private readonly targetSignal = signal<Date | null>(null);
  private readonly errorSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly transitions = new Subject<Transition>();

  private liveRates: RatesSnapshot | null = null;
  private liveMood: MoodSnapshot | null = null;
  private requestId = 0;

  readonly target = this.targetSignal.asReadonly();
  readonly active = computed(() => this.targetSignal() !== null);
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  constructor() {
    const subscription = this.transitions
      .pipe(switchMap((transition) => this.applyTransition(transition)))
      .subscribe();
    const removeHashListener = this.platform.onHashChange(() => this.syncFromUrl());

    this.destroyRef.onDestroy(() => {
      subscription.unsubscribe();
      removeHashListener();
      this.poller.stop();
      this.binance.stop();
      this.mood.stop();
    });

    const currentUrl = this.platform.currentUrl();
    const initialTarget = timeTargetFromUrl(currentUrl);
    const invalidTimeTarget = initialTarget === null && hasTimeTargetParam(currentUrl);
    this.transitionTo(initialTarget, invalidTimeTarget, true);
  }

  setTarget(target: Date | null): void {
    if (target !== null
      && (!Number.isFinite(target.getTime()) || target.getTime() > Date.now())) return;
    this.transitionTo(target ? new Date(target) : null, true);
  }

  dismissError(): void {
    this.errorSignal.set(false);
  }

  stepBack(unit: TimeStep): void {
    this.setTarget(historicalTargetFrom(new Date(), unit));
  }

  private transitionTo(target: Date | null, writeUrl: boolean, force = false): void {
    const currentMs = this.targetSignal()?.getTime() ?? null;
    const nextMs = target?.getTime() ?? null;
    if (!force && currentMs === nextMs) return;
    this.transitions.next({ target, writeUrl });
  }

  private applyTransition(transition: Transition): Observable<never> | Observable<HistoricalPair> {
    if (transition.target === null) {
      this.restorePresent(transition.writeUrl, false);
      return EMPTY;
    }
    return this.enterHistorical(transition.target, transition.writeUrl);
  }

  private enterHistorical(target: Date, writeUrl: boolean): Observable<HistoricalPair> {
    const id = ++this.requestId;
    if (this.liveRates === null) {
      this.liveRates = this.store.snapshot();
      this.liveMood = this.mood.snapshot();
    }

    this.poller.stop();
    this.binance.stop();
    this.mood.stop();
    this.targetSignal.set(new Date(target));
    this.loadingSignal.set(true);
    this.errorSignal.set(false);
    this.store.applyHistorical(this.toHistoricalQuotes({}), target);
    this.mood.applyHistorical({}, {});
    if (writeUrl) this.replaceUrl(target);

    const baselineTarget = new Date(target.getTime() - HISTORICAL_BASELINE_MS);
    return forkJoin({
      baseline: this.fetchAt(baselineTarget),
      current: this.fetchAt(target),
    }).pipe(
      tap(({ baseline, current }) => {
        if (id !== this.requestId) return;
        this.applyHistorical(current, baseline, target);
      }),
      catchError(() => {
        if (id === this.requestId) this.restorePresent(true, true);
        return EMPTY;
      }),
      finalize(() => {
        if (id === this.requestId) this.loadingSignal.set(false);
      }),
    );
  }

  private fetchAt(target: Date): Observable<HistoricalSnapshot> {
    return this.http
      .get<unknown>(`${this.apiBase}/at`, { params: { ts: target.toISOString() } })
      .pipe(
        map((response) => {
          const parsed = parseAtResponse(response);
          if (parsed === null) throw new Error('Invalid /at response');
          return parsed;
        }),
      );
  }

  private applyHistorical(
    current: HistoricalSnapshot,
    baseline: HistoricalSnapshot,
    target: Date,
  ): void {
    this.store.applyHistorical(this.toHistoricalQuotes(current), target);
    this.mood.applyHistorical(baseline, current);
  }

  private toHistoricalQuotes(current: HistoricalSnapshot): Quote[] {
    return liveInstruments().map((instrument) => {
      const entry = current[instrument.id] ?? null;
      const source: QuoteSource = instrument.market === 'crypto' ? 'binance' : 'moex';
      return {
        instrumentId: instrument.id,
        value: entry?.value ?? null,
        time: entry?.ts ?? null,
        systime: entry?.ts ?? null,
        source,
        status: entry ? 'historical' : 'unavailable',
      };
    });
  }

  private restorePresent(writeUrl: boolean, failed: boolean): void {
    ++this.requestId;
    if (this.liveRates !== null) {
      this.store.restore(this.liveRates);
      this.liveRates = null;
    }
    if (this.liveMood !== null) {
      this.mood.restore(this.liveMood);
      this.liveMood = null;
    }

    this.targetSignal.set(null);
    this.loadingSignal.set(false);
    this.errorSignal.set(failed);
    this.mood.start();
    this.poller.start();
    this.binance.start();
    if (writeUrl) this.replaceUrl(null);
  }

  private syncFromUrl(): void {
    const currentUrl = this.platform.currentUrl();
    const target = timeTargetFromUrl(currentUrl);
    const invalidTimeTarget = target === null && hasTimeTargetParam(currentUrl);
    this.transitionTo(target, invalidTimeTarget, invalidTimeTarget);
  }

  private replaceUrl(target: Date | null): void {
    this.platform.replaceUrl(canonicalTimeUrl(this.platform.currentUrl(), target));
  }
}
