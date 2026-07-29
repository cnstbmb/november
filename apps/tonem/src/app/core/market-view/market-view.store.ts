import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { DerivedEngine } from '../derived/derived.engine';
import { RatesStore, TickerEntry } from '../rates/rates.store';
import { ViewSettingsStore } from '../view-settings/view-settings.store';

export const HERO_ROTATION_INTERVAL_MS = 12_000;

@Injectable({ providedIn: 'root' })
export class MarketViewStore {
  private readonly rates = inject(RatesStore);
  private readonly derived = inject(DerivedEngine);
  private readonly viewSettings = inject(ViewSettingsStore);
  private readonly rotationIndex = signal(0);

  private readonly entriesById = computed<ReadonlyMap<string, TickerEntry>>(() => {
    const live = this.rates.ticker().filter((entry) => entry.instrument.placement === 'live');
    return new Map(
      [...live, ...this.derived.derivedTicker()].map((entry) => [entry.instrument.id, entry]),
    );
  });

  /** Registry entries in the user's order, before visibility/availability filtering. */
  readonly ordered = computed<readonly TickerEntry[]>(() => {
    const entries = this.entriesById();
    return this.viewSettings
      .instruments()
      .order.map((id) => entries.get(id))
      .filter((entry): entry is TickerEntry => entry !== undefined);
  });

  /** Hidden entries and unavailable derived values are absent; unavailable live feeds remain honest dashes. */
  readonly ticker = computed<readonly TickerEntry[]>(() => {
    const hidden = new Set(this.viewSettings.instruments().hidden);
    return this.ordered().filter(
      (entry) =>
        !hidden.has(entry.instrument.id) &&
        !(entry.instrument.placement === 'derived' && entry.quote.status === 'unavailable'),
    );
  });

  readonly rotationFavorites = computed<readonly TickerEntry[]>(() => {
    const favorites = new Set(this.viewSettings.hero().favorites);
    return this.ticker().filter((entry) => favorites.has(entry.instrument.id));
  });

  /** Hidden affects the tape only: a pinned hero remains exact, even when unavailable. */
  readonly hero = computed<TickerEntry | null>(() => {
    const settings = this.viewSettings.hero();
    const ticker = this.ticker();
    if (settings.mode === 'pinned') {
      return this.entriesById().get(settings.pinnedId) ?? ticker[0] ?? null;
    }

    const favorites = this.rotationFavorites();
    if (favorites.length === 0) return ticker[0] ?? null;
    return favorites[this.rotationIndex() % favorites.length] ?? null;
  });

  readonly canOpenHeroSparkline = computed(
    () => this.hero()?.instrument.placement === 'live',
  );

  constructor() {
    const timer = globalThis.setInterval(
      () => this.advanceRotation(),
      HERO_ROTATION_INTERVAL_MS,
    );
    inject(DestroyRef).onDestroy(() => globalThis.clearInterval(timer));
  }

  advanceRotation(): void {
    if (this.viewSettings.hero().mode !== 'rotation') return;
    this.rotationIndex.update((index) => index + 1);
  }

  resetRotation(): void {
    this.rotationIndex.set(0);
  }
}
