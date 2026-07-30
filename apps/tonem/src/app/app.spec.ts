import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { RecordedMusicPlayer } from './core/music/recorded-music-player';
import { liveInstruments } from './core/instruments/instrument.registry';
import { LatestQuotesCacheService } from './core/offline/latest-quotes-cache.service';
import { ConnectivityService } from './core/offline/connectivity.service';
import { RatesStore } from './core/rates/rates.store';
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

  beforeEach(async () => {
    cachedQuotes = {};
    online = signal(true);
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
            currentTrack: () => null,
            enableFromGesture: () => undefined,
            disable: () => undefined,
            setVolume: () => undefined,
            next: () => undefined,
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
    expect(el.querySelector('.ticker')).toBeNull();
    expect(el.querySelector('.settings-trigger')).toBeTruthy();
  });

  it('лента: живые инструменты + производные, без дублей', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // До загрузки: только живые (производные с unavailable скрыты).
    expect(el.querySelectorAll('.ticker-item').length).toBe(liveInstruments().length);

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
    const eurusdRows = el.querySelectorAll(
      '[data-instrument="eurusd"], .ticker-item',
    );
    expect(el.querySelectorAll('[data-instrument="eurusd"]')).toHaveLength(1);
    const labels = Array.from(eurusdRows).map((node) => node.textContent ?? '');
    expect(labels.filter((text) => text.includes('EUR/USD'))).toHaveLength(1);
  });
});
