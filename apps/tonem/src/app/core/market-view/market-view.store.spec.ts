import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DerivedEngine } from '../derived/derived.engine';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { RawQuote } from '../rates/quote.model';
import { RatesStore } from '../rates/rates.store';
import { VIEW_SETTINGS_PLATFORM, ViewSettingsPlatform } from '../view-settings/view-settings.platform';
import { ViewSettingsStore } from '../view-settings/view-settings.store';
import { MarketViewStore } from './market-view.store';

const NOW = new Date('2026-07-28T12:00:10+03:00');

class MemoryPlatform implements ViewSettingsPlatform {
  url = 'https://tonem.ru/';
  currentUrl(): string { return this.url; }
  replaceUrl(url: string): void { this.url = url; }
  readStorage(): string | null { return null; }
  writeStorage(): void {}
  async copyText(): Promise<void> {}
  onHashChange(): () => void { return () => undefined; }
}

function raw(instrumentId: string, value: number): RawQuote {
  return {
    instrumentId,
    value,
    time: new Date('2026-07-28T12:00:00+03:00'),
    systime: new Date('2026-07-28T12:00:05+03:00'),
  };
}

describe('MarketViewStore', () => {
  let rates: RatesStore;
  let settings: ViewSettingsStore;
  let market: MarketViewStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RatesStore,
        DerivedEngine,
        ViewSettingsStore,
        MarketViewStore,
        { provide: LatestQuotesCacheService, useValue: { load: () => ({}), save: () => undefined } },
        { provide: VIEW_SETTINGS_PLATFORM, useValue: new MemoryPlatform() },
      ],
    });
    rates = TestBed.inject(RatesStore);
    settings = TestBed.inject(ViewSettingsStore);
    market = TestBed.inject(MarketViewStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('honors user order and hidden instruments', () => {
    settings.setInstrumentOrder(['btc', 'usdrub']);
    settings.setInstrumentHidden('usdrub', true);

    const ids = market.ticker().map((entry) => entry.instrument.id);
    expect(ids[0]).toBe('btc');
    expect(ids).not.toContain('usdrub');
  });

  it('hides unavailable derived entries and reveals them when inputs arrive', () => {
    settings.setInstrumentOrder(['btcrub', 'usdrub', 'btc']);
    expect(market.ticker().map((entry) => entry.instrument.id)).not.toContain('btcrub');

    rates.apply([raw('usdrub', 80), raw('btc', 100_000)], 'moex', NOW);

    expect(market.ticker().map((entry) => entry.instrument.id)[0]).toBe('btcrub');
    expect(market.ticker()[0].quote.value).toBe(8_000_000);
  });

  it('keeps the exact pinned instrument while a derived value is unavailable', () => {
    settings.pinInstrument('btcrub');
    expect(market.hero()?.instrument.id).toBe('btcrub');
    expect(market.hero()?.quote.status).toBe('unavailable');
    expect(market.canOpenHeroSparkline()).toBe(false);

    rates.apply([raw('usdrub', 80), raw('btc', 100_000)], 'moex', NOW);

    expect(market.hero()?.instrument.id).toBe('btcrub');
    expect(market.hero()?.quote.value).toBe(8_000_000);
  });

  it('disables the live sparkline in historical mode', () => {
    rates.apply([raw('usdrub', 80)], 'moex', NOW);
    expect(market.canOpenHeroSparkline()).toBe(true);

    rates.applyHistorical(
      [{ ...rates.hero().quote, status: 'historical' }],
      NOW,
    );

    expect(market.canOpenHeroSparkline()).toBe(false);
  });

  it('rotates through favorites even before a derived value becomes available', () => {
    settings.update((value) => ({
      ...value,
      hero: { ...value.hero, mode: 'rotation', favorites: ['usdrub', 'btcrub'] },
    }));

    expect(market.rotationFavorites().map((entry) => entry.instrument.id)).toEqual([
      'usdrub',
      'btcrub',
    ]);
    market.advanceRotation();
    expect(market.hero()?.instrument.id).toBe('btcrub');
    expect(market.hero()?.quote.status).toBe('unavailable');

    rates.apply([raw('usdrub', 80), raw('btc', 100_000)], 'moex', NOW);

    expect(market.rotationFavorites().map((entry) => entry.instrument.id)).toEqual([
      'usdrub',
      'btcrub',
    ]);
    expect(market.hero()?.instrument.id).toBe('btcrub');
  });

  it('keeps hidden tape entries in the favorites rotation', () => {
    settings.update((value) => ({
      ...value,
      hero: { ...value.hero, mode: 'rotation', favorites: ['usdrub', 'btc'] },
    }));
    settings.setInstrumentHidden('btc', true);
    market.advanceRotation();

    expect(market.rotationFavorites().map((entry) => entry.instrument.id)).toEqual([
      'usdrub',
      'btc',
    ]);
    expect(market.hero()?.instrument.id).toBe('btc');
  });
});
