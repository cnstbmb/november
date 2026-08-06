import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LatestQuotesCacheService } from '../offline/latest-quotes-cache.service';
import { RatesPoller } from './rates-poller.service';
import { RatesStore } from './rates.store';
import currencyBatch from '../moex/__fixtures__/currency-batch.json';
import imoexJson from '../moex/__fixtures__/imoex.json';
import fortsBatch from '../moex/__fixtures__/forts-batch.json';
import cbrDaily from '../cbr/__fixtures__/cbr-daily.json';

describe('RatesPoller', () => {
  let poller: RatesPoller;
  let store: RatesStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RatesPoller,
        RatesStore,
        { provide: LatestQuotesCacheService, useValue: { load: () => ({}), save: () => undefined } },
      ],
    });
    poller = TestBed.inject(RatesPoller);
    store = TestBed.inject(RatesStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    poller.stop();
    http.verify();
  });

  const flushMoexCycle = () => {
    http.expectOne((r) => r.url.includes('/engines/currency/')).flush(currencyBatch);
    http.expectOne((r) => r.url.includes('/engines/stock/')).flush(imoexJson);
    http.expectOne((r) => r.url.includes('/engines/futures/')).flush(fortsBatch);
    http.expectOne((r) => r.url === 'https://api.tonem.ru/latest').flush({
      ton: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 1.378,
        meta: { source: 'kraken', pair: 'TONUSD' },
      },
    });
  };

  it('отменяет in-flight цикл при stop и не смешивает его с новым start', () => {
    poller.start();
    const oldCurrency = http.expectOne((r) => r.url.includes('/engines/currency/'));
    const oldIndex = http.expectOne((r) => r.url.includes('/engines/stock/'));
    const oldFutures = http.expectOne((r) => r.url.includes('/engines/futures/'));
    const oldBackend = http.expectOne((r) => r.url === 'https://api.tonem.ru/latest');

    poller.stop();
    expect(oldCurrency.cancelled).toBe(true);
    expect(oldIndex.cancelled).toBe(true);
    expect(oldFutures.cancelled).toBe(true);
    expect(oldBackend.cancelled).toBe(true);

    poller.start();
    flushMoexCycle();
    expect(store.hero().quote.value).toBeCloseTo(79.485, 3);
  });

  it('цикл загружает котировки всех трёх источников в стор', () => {
    poller.start();
    flushMoexCycle();

    expect(store.hero().quote.value).toBeCloseTo(79.485, 3);
    expect(store.quoteOf('brent')?.value).not.toBeNull();
    expect(store.quoteOf('imoex')?.value).toBeCloseTo(2191.18, 2);
    expect(store.quoteOf('ton')?.value).toBe(1.378);
    expect(store.quoteOf('ton')?.source).toBe('kraken');
  });

  it('backend остаётся fallback и не затирает более свежий Kraken WebSocket тик', () => {
    const websocketTs = new Date('2026-08-06T18:58:25.000Z');
    store.apply([{
      instrumentId: 'ton',
      value: 1.39,
      time: websocketTs,
      systime: websocketTs,
    }], 'kraken', websocketTs);

    poller.start();
    flushMoexCycle();

    expect(store.quoteOf('ton')?.value).toBe(1.39);
    expect(store.quoteOf('ton')?.systime).toEqual(websocketTs);
  });

  it('падение MOEX currency → фолбэк на ЦБ с пометкой источника', async () => {
    poller.start();
    http
      .expectOne((r) => r.url.includes('/engines/currency/'))
      .flush('boom', { status: 500, statusText: 'ERR' });
    http.expectOne((r) => r.url.includes('/engines/stock/')).flush(imoexJson);
    http.expectOne((r) => r.url.includes('/engines/futures/')).flush(fortsBatch);
    http.expectOne((r) => r.url === 'https://api.tonem.ru/latest').flush({});

    const cbrReq = http.expectOne((r) => r.url.includes('cbr-xml-daily.ru'));
    cbrReq.flush(cbrDaily);

    expect(store.hero().quote.source).toBe('cbr');
    expect(store.hero().quote.value).not.toBeNull();
    // не-FX инструменты остались от MOEX
    expect(store.quoteOf('imoex')?.source).toBe('moex');
  });

  it('пустой marketdata (maintenance, HTTP 200) → тоже фолбэк на ЦБ', () => {
    poller.start();
    http
      .expectOne((r) => r.url.includes('/engines/currency/'))
      .flush({ marketdata: { columns: ['SECID', 'LAST', 'TIME', 'SYSTIME'], data: [] } });
    http.expectOne((r) => r.url.includes('/engines/stock/')).flush(imoexJson);
    http.expectOne((r) => r.url.includes('/engines/futures/')).flush(fortsBatch);
    http.expectOne((r) => r.url === 'https://api.tonem.ru/latest').flush({});

    http.expectOne((r) => r.url.includes('cbr-xml-daily.ru')).flush(cbrDaily);

    expect(store.hero().quote.source).toBe('cbr');
    expect(store.hero().quote.value).not.toBeNull();
  });
});
