import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import { instrumentById } from '../instruments/instrument.registry';
import { deriveStatus } from '../moex/market-hours';
import { Quote, QuotePriceType, QuoteSource } from '../rates/quote.model';

export const LATEST_QUOTES_CACHE_KEY = 'tonem.latest-quotes';
export const LATEST_QUOTES_CACHE_VERSION = 1;
export const LATEST_QUOTES_SAVE_DELAY_MS = 250;

export type LatestQuotes = Readonly<Record<string, Quote>>;
export type LatestQuotesInput = readonly Quote[] | LatestQuotes;

export const OFFLINE_STORAGE = new InjectionToken<Storage | null>('OFFLINE_STORAGE', {
  providedIn: 'root',
  factory: browserStorage,
});

interface StoredQuote {
  readonly value: number | null;
  readonly time: string | null;
  readonly systime: string | null;
  readonly receivedAt?: string | null;
  readonly source: QuoteSource;
  readonly priceType?: QuotePriceType;
}

interface LatestQuotesPayload {
  readonly version: typeof LATEST_QUOTES_CACHE_VERSION;
  readonly savedAt: string;
  readonly quotes: Readonly<Record<string, StoredQuote>>;
}

@Injectable({ providedIn: 'root' })
export class LatestQuotesCacheService {
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly destroyRef = inject(DestroyRef);
  private pending: Readonly<Record<string, StoredQuote>> | null = null;
  private lastKnown: Readonly<Record<string, StoredQuote>> = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pagehideTarget = browserWindow();
  private readonly pagehideListener = () => this.flush();

  constructor() {
    this.pagehideTarget?.addEventListener('pagehide', this.pagehideListener);
    this.destroyRef.onDestroy(() => {
      this.pagehideTarget?.removeEventListener('pagehide', this.pagehideListener);
      this.flush();
    });
  }

  /** Read a validated cache snapshot and derive statuses for the current clock. */
  load(now = new Date()): LatestQuotes {
    let serialized: string | null;
    try {
      serialized = this.storage?.getItem(LATEST_QUOTES_CACHE_KEY) ?? null;
    } catch {
      return {};
    }

    if (serialized === null) return {};

    let candidate: unknown;
    try {
      candidate = JSON.parse(serialized);
    } catch {
      return {};
    }

    if (!isPayload(candidate)) return {};

    const savedAt = new Date(candidate.savedAt);

    const quotes: Record<string, Quote> = {};
    for (const [instrumentId, stored] of Object.entries(candidate.quotes)) {
      const instrument = instrumentById(instrumentId);
      const quote = reviveStoredQuote(stored, savedAt);
      if (!instrument || instrument.placement !== 'live' || quote === null || quote.value === null) continue;

      this.lastKnown = { ...this.lastKnown, [instrumentId]: stored };
      quotes[instrumentId] = {
        instrumentId,
        ...quote,
        status: deriveStatus({
          value: quote.value,
          receivedAt: quote.receivedAt ?? null,
          market: instrument.market,
          now,
        }),
      };
    }
    return quotes;
  }

  /** Coalesce rapid quote updates and persist only the newest normalized snapshot. */
  save(quotes: LatestQuotesInput): void {
    this.pending = {
      ...this.lastKnown,
      ...(this.pending ?? {}),
      ...normalizeQuotes(quotes),
    };
    if (this.saveTimer !== null) return;

    this.saveTimer = setTimeout(() => this.flush(), LATEST_QUOTES_SAVE_DELAY_MS);
  }

  /** Persist pending data synchronously; used by pagehide so the last ticks are not lost. */
  flush(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.pending === null) return;

    const payload: LatestQuotesPayload = {
      version: LATEST_QUOTES_CACHE_VERSION,
      savedAt: new Date().toISOString(),
      quotes: this.pending,
    };
    this.lastKnown = this.pending;
    this.pending = null;

    try {
      this.storage?.setItem(LATEST_QUOTES_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Storage may be disabled, full, or inaccessible in privacy/SSR contexts.
    }
  }

  clear(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.pending = null;
    try {
      this.storage?.removeItem(LATEST_QUOTES_CACHE_KEY);
    } catch {
      // A blocked storage backend must never prevent the app from starting.
    }
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function browserWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function normalizeQuotes(input: LatestQuotesInput): Readonly<Record<string, StoredQuote>> {
  const values = Array.isArray(input) ? input : Object.values(input);
  const normalized: Record<string, StoredQuote> = {};

  for (const quote of values) {
    const instrument = instrumentById(quote.instrumentId);
    const time = serializeDate(quote.time);
    const systime = serializeDate(quote.systime);
    const receivedAt = serializeDate(quote.receivedAt ?? quote.systime);
    if (!instrument || instrument.placement !== 'live' || quote.value === null) continue;
    if (time === undefined || systime === undefined || receivedAt === undefined) continue;
    if (!isQuoteValue(quote.value) || !isQuoteSource(quote.source)) continue;

    normalized[quote.instrumentId] = {
      value: quote.value,
      time,
      systime,
      receivedAt,
      source: quote.source,
      ...(quote.priceType ? { priceType: quote.priceType } : {}),
    };
  }
  return normalized;
}

function serializeDate(value: Date | null): string | null | undefined {
  if (value === null) return null;
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : undefined;
}

function isPayload(value: unknown): value is LatestQuotesPayload {
  if (!isRecord(value)) return false;
  if (value['version'] !== LATEST_QUOTES_CACHE_VERSION) return false;
  if (typeof value['savedAt'] !== 'string' || !isIsoDate(value['savedAt'])) return false;
  return isRecord(value['quotes']);
}

function reviveStoredQuote(
  value: unknown,
  fallbackReceivedAt: Date,
): Omit<Quote, 'instrumentId' | 'status'> | null {
  if (!isRecord(value) || !isQuoteValue(value['value']) || !isQuoteSource(value['source'])) {
    return null;
  }

  const time = reviveDate(value['time']);
  const systime = reviveDate(value['systime']);
  const receivedAt = value['receivedAt'] === undefined
    ? new Date(fallbackReceivedAt)
    : reviveDate(value['receivedAt']);
  const priceType = value['priceType'];
  if (time === undefined || systime === undefined || receivedAt === undefined) return null;
  if (priceType !== undefined && !isQuotePriceType(priceType)) return null;

  return {
    value: value['value'],
    time,
    systime,
    receivedAt,
    source: value['source'],
    ...(priceType ? { priceType } : {}),
  };
}

function reviveDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !isIsoDate(value)) return undefined;
  return new Date(value);
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function isQuoteValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isQuoteSource(value: unknown): value is QuoteSource {
  return value === 'moex' || value === 'cbr' || value === 'binance' || value === 'kraken';
}

function isQuotePriceType(value: unknown): value is QuotePriceType {
  return value === 'last' || value === 'settlement';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
