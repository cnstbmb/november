import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Instrument } from '../instruments/instrument.model';
import { CandlesService, nearestFuturesSecid } from './candles.service';
import moexFixture from './__fixtures__/moex-candles-usdrub.json';
import klinesFixture from './__fixtures__/binance-klines-btc.json';
import fortsBoard from '../moex/__fixtures__/forts-batch.json';

const usdrub: Instrument = {
  id: 'usdrub',
  label: 'USD/RUB',
  heroLabel: 'рублей за доллар',
  unit: '₽',
  decimals: 2,
  market: 'fx',
  placement: 'live',
  moex: { kind: 'currency', secid: 'USD000UTSTOM' },
};

const brent: Instrument = {
  id: 'brent',
  label: 'Нефть',
  heroLabel: 'долларов за баррель',
  unit: '$',
  decimals: 2,
  market: 'futures',
  placement: 'live',
  moex: { kind: 'futures', assetCode: 'BR' },
};

const btc: Instrument = {
  id: 'btc',
  label: 'BTC',
  heroLabel: 'долларов за биткоин',
  unit: '$',
  decimals: 0,
  market: 'crypto',
  placement: 'live',
  binance: { symbol: 'BTCUSDT' },
};

describe('CandlesService', () => {
  let service: CandlesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CandlesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('currency: запрашивает candles.json на currency/selt с готовым SECID', () => {
    const now = new Date('2026-07-28T12:00:00+03:00'); // день, рынок открыт
    let out: unknown;
    service.intraday(usdrub, now).subscribe((r) => (out = r));

    const req = http.expectOne(
      (r) =>
        r.url.includes('/engines/currency/markets/selt/securities/USD000UTSTOM/candles.json'),
    );
    expect(req.request.params.get('interval')).toBe('10');
    expect(req.request.params.get('from')).toBe('2026-07-28');
    req.flush(moexFixture);

    const curve = out as { candles: unknown[]; session: string };
    expect(curve.session).toBe('current');
    expect(curve.candles).toHaveLength(4);
  });

  it('futures: сначала резолвит ближайший контракт RFUD, потом его candles', () => {
    const now = new Date('2026-07-28T12:00:00+03:00');
    let out: unknown;
    service.intraday(brent, now).subscribe((r) => (out = r));

    // листинг доски
    http
      .expectOne((r) => r.url.includes('/engines/futures/markets/forts/boards/RFUD/'))
      .flush(fortsBoard);
    // свечи ближайшего контракта: BRQ6 (эксп. 2026-08-03 — первая >= сегодня)
    const candlesReq = http.expectOne((r) =>
      r.url.includes('/engines/futures/markets/forts/securities/BRQ6/candles.json'),
    );
    expect(candlesReq.request.params.get('interval')).toBe('10');
    candlesReq.flush(moexFixture);

    expect((out as { candles: unknown[] }).candles).toHaveLength(4);
  });

  it('crypto: запрашивает Binance klines, всегда current', () => {
    const now = new Date('2026-07-28T03:00:00+03:00'); // ночь — для крипты всё равно
    let out: unknown;
    service.intraday(btc, now).subscribe((r) => (out = r));

    const req = http.expectOne((r) => r.url.includes('api.binance.com/api/v3/klines'));
    expect(req.request.params.get('symbol')).toBe('BTCUSDT');
    expect(req.request.params.get('interval')).toBe('5m');
    req.flush(klinesFixture);

    const curve = out as { candles: unknown[]; session: string };
    expect(curve.session).toBe('current');
    expect(curve.candles).toHaveLength(3);
  });

  it('ночь для MOEX: from — предыдущий день, session=last', () => {
    const now = new Date('2026-07-28T03:00:00+03:00'); // ночь, рынок закрыт
    let out: unknown;
    service.intraday(usdrub, now).subscribe((r) => (out = r));

    const req = http.expectOne((r) => r.url.includes('USD000UTSTOM/candles.json'));
    expect(req.request.params.get('from')).toBe('2026-07-27');
    req.flush(moexFixture);

    expect((out as { session: string }).session).toBe('last');
  });

  it('сетевая ошибка → пустая кривая, без исключения', () => {
    const now = new Date('2026-07-28T12:00:00+03:00');
    let out: unknown;
    service.intraday(usdrub, now).subscribe((r) => (out = r));

    http
      .expectOne((r) => r.url.includes('USD000UTSTOM/candles.json'))
      .flush('boom', { status: 500, statusText: 'ERR' });

    expect((out as { candles: unknown[] }).candles).toEqual([]);
  });

  it('инструмент без источника → пустая кривая без запроса', () => {
    const derived: Instrument = { ...usdrub, moex: undefined, placement: 'derived' };
    let out: unknown;
    service.intraday(derived).subscribe((r) => (out = r));
    http.expectNone(() => true);
    expect((out as { candles: unknown[] }).candles).toEqual([]);
  });
});

describe('nearestFuturesSecid — выбор ближайшего контракта', () => {
  it('берёт ближайшую экспирацию не раньше сегодня', () => {
    const now = new Date('2026-07-28T12:00:00+03:00');
    expect(nearestFuturesSecid(fortsBoard, 'BR', now)).toBe('BRQ6');
  });

  it('если все экспирации в прошлом — ближайшую по дате (наименьшую)', () => {
    const future = new Date('2030-01-01T12:00:00+03:00');
    // пул = все контракты, сортировка по expiry → BRQ6 (2026-08-03, самая ранняя)
    expect(nearestFuturesSecid(fortsBoard, 'BR', future)).toBe('BRQ6');
  });

  it('неизвестный assetCode → null', () => {
    const now = new Date('2026-07-28T12:00:00+03:00');
    expect(nearestFuturesSecid(fortsBoard, 'XX', now)).toBeNull();
  });

  it('битый ответ → null', () => {
    const now = new Date('2026-07-28T12:00:00+03:00');
    expect(nearestFuturesSecid(null, 'BR', now)).toBeNull();
    expect(nearestFuturesSecid({}, 'BR', now)).toBeNull();
  });
});
