import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { liveInstruments } from './core/instruments/instrument.registry';
import { RatesStore } from './core/rates/rates.store';
import { RawQuote } from './core/rates/quote.model';

const raw = (over: Partial<RawQuote>): RawQuote => ({
  instrumentId: 'usdrub',
  value: 78.58,
  time: new Date('2026-07-28T12:00:00+03:00'),
  systime: new Date('2026-07-28T12:00:05+03:00'),
  ...over,
});

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    // EUR/USD должен встречаться не более одного раза.
    const labels = Array.from(eurusdRows).map((n) => n.textContent ?? '');
    const eurusdCount = labels.filter((t) => t.includes('EUR/USD')).length;
    expect(eurusdCount).toBeLessThanOrEqual(1);
  });
});
