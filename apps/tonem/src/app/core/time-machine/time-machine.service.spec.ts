import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BinanceWsService } from '../binance/binance-ws.service';
import { liveInstruments } from '../instruments/instrument.registry';
import { MoodEngine } from '../mood/mood.engine';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { Quote } from '../rates/quote.model';
import { RatesPoller } from '../rates/rates-poller.service';
import { RatesStore } from '../rates/rates.store';
import { VIEW_SETTINGS_PLATFORM, ViewSettingsPlatform } from '../view-settings/view-settings.platform';
import {
  TIME_MACHINE_API_BASE,
  TimeMachineService,
  historicalTargetFrom,
  parseAtResponse,
} from './time-machine.service';

const API = 'https://history.test';
const A = new Date('2026-07-28T12:00:00.000Z');
const B = new Date('2026-07-27T15:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

class MemoryPlatform implements ViewSettingsPlatform {
  url = 'https://tonem.ru/#view=kept';
  readonly listeners = new Set<() => void>();

  currentUrl(): string { return this.url; }
  replaceUrl(url: string): void { this.url = url; }
  readStorage(): string | null { return null; }
  writeStorage(): void {}
  async copyText(): Promise<void> {}
  onHashChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emitHashChange(): void {
    for (const listener of this.listeners) listener();
  }
}

const liveQuote = (value = 80): Quote => ({
  instrumentId: 'usdrub',
  value,
  time: new Date('2026-07-29T09:00:00.000Z'),
  systime: new Date('2026-07-29T09:00:05.000Z'),
  source: 'moex',
  status: 'live',
});

function response(ts: Date, value: number) {
  return Object.fromEntries([
    ...liveInstruments().map((instrument) => [instrument.id, null] as const),
    ['usdrub', { ts: ts.toISOString(), value, meta: null }],
  ]);
}

function requestAt(http: HttpTestingController, ts: Date): TestRequest {
  return http.expectOne((request) =>
    request.url === `${API}/at` && request.params.get('ts') === ts.toISOString(),
  );
}

function flushPair(http: HttpTestingController, target: Date, baselineValue: number, value: number): void {
  requestAt(http, new Date(target.getTime() - DAY_MS)).flush(
    response(new Date(target.getTime() - DAY_MS), baselineValue),
  );
  requestAt(http, target).flush(response(target, value));
}

describe('TimeMachineService', () => {
  let platform: MemoryPlatform;
  let poller: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let binance: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let http: HttpTestingController;
  let store: RatesStore;
  let mood: MoodEngine;

  beforeEach(() => {
    platform = new MemoryPlatform();
    poller = { start: vi.fn(), stop: vi.fn() };
    binance = { start: vi.fn(), stop: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TimeMachineService,
        RatesStore,
        MoodEngine,
        { provide: TIME_MACHINE_API_BASE, useValue: API },
        { provide: VIEW_SETTINGS_PLATFORM, useValue: platform },
        { provide: RatesPoller, useValue: poller },
        { provide: BinanceWsService, useValue: binance },
        {
          provide: LatestQuotesCacheService,
          useValue: { load: () => ({ usdrub: liveQuote() }), save: () => undefined },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(RatesStore);
    mood = TestBed.inject(MoodEngine);
  });

  afterEach(() => {
    mood.stop();
    http.verify();
    TestBed.resetTestingModule();
  });

  it('normalizes month steps at the end of a longer month', () => {
    expect(historicalTargetFrom(new Date(2026, 2, 31, 12), 'month'))
      .toEqual(new Date(2026, 1, 28, 12));
  });

  it('rejects a future URL target, removes ts, and keeps live running', () => {
    platform.url = 'https://tonem.ru/#view=kept&ts=2099-01-01T00%3A00%3A00.000Z';
    const service = TestBed.inject(TimeMachineService);

    expect(service.active()).toBe(false);
    expect(poller.start).toHaveBeenCalledTimes(1);
    expect(binance.start).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(new URL(platform.url).hash.slice(1)).has('ts')).toBe(false);
  });

  it('owns live startup and keeps live paused for an initial #ts', () => {
    platform.url = `https://tonem.ru/#view=kept&ts=${encodeURIComponent(A.toISOString())}`;
    const service = TestBed.inject(TimeMachineService);

    expect(service.active()).toBe(true);
    expect(poller.start).not.toHaveBeenCalled();
    expect(binance.start).not.toHaveBeenCalled();
    expect(poller.stop).toHaveBeenCalledTimes(1);
    expect(binance.stop).toHaveBeenCalledTimes(1);

    flushPair(http, A, 79, 81);
    expect(store.hero().quote.value).toBe(81);
    expect(store.hero().quote.status).toBe('historical');
  });

  it('fails open automatically, restores live immediately, and removes ts', () => {
    const service = TestBed.inject(TimeMachineService);
    expect(poller.start).toHaveBeenCalledTimes(1);

    service.setTarget(A);
    const current = requestAt(http, A);
    const baseline = requestAt(http, new Date(A.getTime() - DAY_MS));
    current.flush('unavailable', { status: 503, statusText: 'Unavailable' });

    expect(baseline.cancelled).toBe(true);
    expect(service.active()).toBe(false);
    expect(service.error()).toBe(true);
    expect(store.hero().quote.value).toBe(80);
    expect(poller.start).toHaveBeenCalledTimes(2);
    expect(binance.start).toHaveBeenCalledTimes(2);
    expect(new URLSearchParams(new URL(platform.url).hash.slice(1)).has('ts')).toBe(false);
  });

  it('switches requests, cancels A, and only applies B', () => {
    const service = TestBed.inject(TimeMachineService);
    service.setTarget(A);
    const aCurrent = requestAt(http, A);
    const aBaseline = requestAt(http, new Date(A.getTime() - DAY_MS));

    service.setTarget(B);
    expect(aCurrent.cancelled).toBe(true);
    expect(aBaseline.cancelled).toBe(true);

    flushPair(http, B, 70, 72);
    expect(service.target()?.toISOString()).toBe(B.toISOString());
    expect(store.hero().quote.value).toBe(72);
  });

  it('restores the separate live quote and smoothed mood after repeated historical steps', () => {
    mood.tick(1);
    const liveMood = mood.mood();
    const service = TestBed.inject(TimeMachineService);

    service.setTarget(A);
    flushPair(http, A, 70, 75);
    service.setTarget(B);
    flushPair(http, B, 60, 65);
    expect(store.hero().quote.value).toBe(65);

    service.setTarget(null);
    expect(store.hero().quote.value).toBe(80);
    expect(mood.mood()).toEqual(liveMood);
  });

  it('marks an instrument missing at that moment as unavailable', () => {
    const service = TestBed.inject(TimeMachineService);
    service.setTarget(A);
    flushPair(http, A, 100, 102);

    expect(store.quoteOf('ai95')?.value).toBeNull();
    expect(store.quoteOf('ai95')?.status).toBe('unavailable');
  });

  it('calculates historical mood from the prior snapshot instead of staying neutral', () => {
    const service = TestBed.inject(TimeMachineService);
    service.setTarget(A);
    flushPair(http, A, 100, 102);

    expect(mood.hue()).toBeGreaterThan(0);
    expect(mood.energy()).toBeGreaterThan(0);
  });

  it('handles hash A→B and hash removal while preserving view', () => {
    const service = TestBed.inject(TimeMachineService);
    platform.url = `https://tonem.ru/#view=kept&ts=${encodeURIComponent(A.toISOString())}`;
    platform.emitHashChange();
    const aCurrent = requestAt(http, A);
    const aBaseline = requestAt(http, new Date(A.getTime() - DAY_MS));

    platform.url = `https://tonem.ru/#view=kept&ts=${encodeURIComponent(B.toISOString())}`;
    platform.emitHashChange();
    expect(aCurrent.cancelled).toBe(true);
    expect(aBaseline.cancelled).toBe(true);
    flushPair(http, B, 70, 71);
    expect(service.target()?.toISOString()).toBe(B.toISOString());

    platform.url = 'https://tonem.ru/#view=kept';
    platform.emitHashChange();
    expect(service.active()).toBe(false);
    expect(store.hero().quote.value).toBe(80);
    expect(new URLSearchParams(new URL(platform.url).hash.slice(1)).get('view')).toBe('kept');
  });

  it('cancels in-flight history so no response can overwrite return-to-present', () => {
    const service = TestBed.inject(TimeMachineService);
    service.setTarget(A);
    const current = requestAt(http, A);
    const baseline = requestAt(http, new Date(A.getTime() - DAY_MS));

    service.setTarget(null);
    expect(current.cancelled).toBe(true);
    expect(baseline.cancelled).toBe(true);
    expect(store.hero().quote.value).toBe(80);
  });
});

describe('parseAtResponse', () => {
  it('matches backend Record<string, Entry|null> and validates dates and finite values', () => {
    const completeResponse = response(A, 80);
    const parsed = parseAtResponse(completeResponse);
    expect(parsed?.['usdrub']?.value).toBe(80);
    expect(parsed?.['usdrub']?.ts.toISOString()).toBe(A.toISOString());
    expect(parsed?.['btc']).toBeNull();

    expect(parseAtResponse({ usdrub: completeResponse['usdrub'] })).toBeNull();
    expect(parseAtResponse({ ...completeResponse, usdrub: { ts: 'bad', value: 80, meta: null } })).toBeNull();
    expect(parseAtResponse({ usdrub: { ts: A.toISOString(), value: Number.POSITIVE_INFINITY } })).toBeNull();
    expect(parseAtResponse([])).toBeNull();
  });
});
