import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { RecordedMusicPlayer } from './core/music/recorded-music-player';
import { liveInstruments } from './core/instruments/instrument.registry';
import { LatestQuotesCacheService } from './core/offline/latest-quotes-cache.service';
import { ConnectivityService } from './core/offline/connectivity.service';
import { RatesStore } from './core/rates/rates.store';
import { MarketViewStore } from './core/market-view/market-view.store';
import { Quote, RawQuote } from './core/rates/quote.model';
import { VIEW_SETTINGS_PLATFORM, ViewSettingsPlatform } from './core/view-settings/view-settings.platform';
import { ViewSettingsStore } from './core/view-settings/view-settings.store';

class AppPlatform implements ViewSettingsPlatform {
  url = 'https://tonem.ru/';
  private readonly storage = new Map<string, string>();
  currentUrl(): string { return this.url; }
  replaceUrl(url: string): void { this.url = url; }
  readStorage(key: string): string | null { return this.storage.get(key) ?? null; }
  writeStorage(key: string, value: string): void { this.storage.set(key, value); }
  async copyText(): Promise<void> {}
  onHashChange(): () => void { return () => undefined; }
}

const raw = (over: Partial<RawQuote>): RawQuote => ({
  instrumentId: 'usdrub',
  value: 78.58,
  time: new Date('2026-07-28T12:00:00+03:00'),
  systime: new Date('2026-07-28T12:00:05+03:00'),
  ...over,
});

describe('App', () => {
  let cachedQuotes: Readonly<Record<string, Quote>>;
  let online: ReturnType<typeof signal<boolean>>;
  let enableMusic: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    cachedQuotes = {};
    online = signal(true);
    enableMusic = vi.fn(() => Promise.resolve());
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LatestQuotesCacheService, useValue: { load: () => cachedQuotes, save: () => undefined } },
        { provide: ConnectivityService, useValue: { online: online.asReadonly() } },
        { provide: VIEW_SETTINGS_PLATFORM, useValue: new AppPlatform() },
        {
          provide: RecordedMusicPlayer,
          useValue: {
            status: signal('off'),
            enableFromGesture: enableMusic,
            disable: () => undefined,
            preload: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('до загрузки данных герой показывает тире', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // одометр рисует цифры барабанами (aria-hidden) + зеркалом .sr-only для скринридера;
    // проверяем доступное текстовое представление, а не визуальные барабаны.
    expect(el.querySelector('.hero-value .sr-only')?.textContent?.trim()).toBe('—');
  });

  it('в офлайне показывает сохранённую котировку и честный статус', async () => {
    cachedQuotes = {
      usdrub: {
        instrumentId: 'usdrub',
        value: 77.12,
        time: new Date('2026-07-28T09:00:00Z'),
        systime: new Date('2026-07-28T09:00:05Z'),
        source: 'moex',
        status: 'closed',
      },
    };
    online.set(false);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.offline-badge')?.textContent?.trim()).toBe('офлайн');
    expect(el.querySelector('.hero-value .sr-only')?.textContent?.trim()).toBe('77,12');
    expect(el.querySelector('.hero-status')?.textContent).toContain('последние данные');

    TestBed.inject(ViewSettingsStore).setZen('hideClock', true);
    await fixture.whenStable();
    expect(el.querySelector('.hero-status')?.textContent?.trim()).toBe('офлайн · последние данные');
  });

  it('дзен может убрать все цифры, не пряча вход в настройки', async () => {
    const fixture = TestBed.createComponent(App);
    const settings = TestBed.inject(ViewSettingsStore);
    settings.setZen('hideHero', true);
    settings.setZen('hideTicker', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.hero-value')).toBeNull();
    expect(el.querySelector('.ticker-list')).toBeNull();
    expect(el.querySelector('.settings-trigger')).toBeTruthy();
  });

  it('лента: живые инструменты + производные в двух копиях для marquee', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // Marquee визуально дублирует полный набор для бесшовной прокрутки.
    expect(el.querySelectorAll('.marquee-chip').length).toBe(liveInstruments().length * 2);
    const groups = el.querySelectorAll('.marquee-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelectorAll('.marquee-chip')).toHaveLength(liveInstruments().length);
    expect(groups[1].querySelectorAll('.marquee-chip')).toHaveLength(liveInstruments().length);
    expect(groups[1].getAttribute('aria-hidden')).toBe('true');
    expect(groups[1].querySelector('button')).toBeNull();

    // После загрузки сырья для EUR/USD: производная появляется ровно один раз,
    // без дублирующей «dimmed» строки из стора.
    const store = TestBed.inject(RatesStore);
    const now = new Date('2026-07-28T12:00:10+03:00');
    store.apply(
      [raw({ instrumentId: 'usdrub' }), raw({ instrumentId: 'eurrub', value: 85.1 })],
      'moex',
      now,
    );
    await fixture.whenStable();
    const eurusdRows = el.querySelectorAll('.marquee-chip');
    const eurusdLabels = Array.from(eurusdRows)
      .filter((row) => row.querySelector('.chip-label')?.textContent?.includes('EUR/USD'));
    expect(eurusdLabels).toHaveLength(2);
    const labels = Array.from(eurusdRows).map((node) => node.textContent ?? '');
    expect(labels.filter((text) => text.includes('EUR/USD'))).toHaveLength(2);
  });

  it('под центральным одометром показывает текущего любимчика при ротации', async () => {
    const fixture = TestBed.createComponent(App);
    const settings = TestBed.inject(ViewSettingsStore);
    const marketView = TestBed.inject(MarketViewStore);
    settings.setHeroMode('rotation');
    await fixture.whenStable();

    const label = () => Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.hero-label > span'),
    ).map((part) => part.textContent?.trim()).join(' ');
    expect(label()).toBe('USD/RUB · фьючерс · рублей за доллар');

    marketView.advanceRotation();
    await fixture.whenStable();
    expect(label()).toBe('EUR/RUB · фьючерс · рублей за евро');
  });

  it('дзен включает музыку и показывает карусель любимчиков с названием и единицами', async () => {
    const fixture = TestBed.createComponent(App);
    const settings = TestBed.inject(ViewSettingsStore);
    const marketView = TestBed.inject(MarketViewStore);
    settings.update((value) => ({
      ...value,
      hero: { ...value.hero, favorites: ['eurrub', 'btc'] },
      zen: { ...value.zen, hideHero: true },
    }));
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('.zen-trigger')?.click();
    await fixture.whenStable();

    const label = () => Array.from<HTMLElement>(
      el.querySelectorAll('.hero-label > span'),
    ).map((part) => part.textContent?.trim()).join(' ');
    expect(settings.zen().active).toBe(true);
    expect(settings.zen().hideHero).toBe(false);
    expect(settings.hero().mode).toBe('rotation');
    expect(enableMusic).toHaveBeenCalledOnce();
    expect(label()).toBe('EUR/RUB · фьючерс · рублей за евро');

    marketView.advanceRotation();
    await fixture.whenStable();
    expect(label()).toBe('BTC · долларов за биткоин');
  });

  it('клик по плитке любимчика закрепляет его на hero в режиме «стоять смирно»', async () => {
    const fixture = TestBed.createComponent(App);
    const settings = TestBed.inject(ViewSettingsStore);
    TestBed.inject(RatesStore).apply(
      [raw({ instrumentId: 'eurrub', value: 85.1 })],
      'moex',
      new Date('2026-07-28T12:00:10+03:00'),
    );
    settings.setHeroMode('rotation');
    await fixture.whenStable();

    const cards = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.favorite-card'),
    );
    const euro = cards.find((card) => card.textContent?.includes('EUR/RUB'));
    expect(euro).toBeTruthy();
    euro?.click();
    await fixture.whenStable();

    expect(settings.hero().mode).toBe('pinned');
    expect(settings.hero().pinnedId).toBe('eurrub');
    expect(fixture.nativeElement.querySelector('.hero-instrument')?.textContent).toContain('EUR/RUB');
  });

  it('settlement показывается как расчётная цена, а не задержка данных', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(RatesStore).apply(
      [raw({
        instrumentId: 'ai95',
        value: 77_040,
        systime: new Date('2026-07-28T10:00:00+03:00'),
        priceType: 'settlement',
      })],
      'moex',
      new Date('2026-07-28T12:00:10+03:00'),
    );
    TestBed.inject(ViewSettingsStore).pinInstrument('ai95');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.hero-status')?.textContent?.trim())
      .toBe('расчётная цена');
  });
});
