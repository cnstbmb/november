import { describe, expect, it, vi } from 'vitest';
import { CollectorService } from '../src/collector.service';
import { QuoteSourcesService } from '../src/quote-sources';
import { TickStore } from '../src/tick-store';

// A weekday during all MOEX trading windows: 2026-07-28 is a Tuesday, 12:00 MSK.
const MOEX_OPEN = new Date('2026-07-28T09:00:00.000Z'); // 12:00 MSK
// A weekend — MOEX closed, crypto still 24/7. 2026-08-01 is a Saturday.
const WEEKEND = new Date('2026-08-01T17:00:00.000Z'); // 20:00 MSK Saturday

const CBR_XML = `<ValCurs Date="29.07.2026">
  <Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>78,6980</Value></Valute>
  <Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>89,6292</Value></Valute>
</ValCurs>`;

function makeSources(): QuoteSourcesService {
  return {
    fetchCbrDailyXml: vi.fn().mockResolvedValue(CBR_XML),
    fetchCurrencyBatch: vi.fn().mockResolvedValue({
      marketdata: {
        columns: ['SECID', 'LAST', 'MARKETPRICE'],
        data: [
          ['CNYRUB_TOM', 11.25, 11.2],
          ['GLDRUB_TOM', 8_750, 8_740],
        ],
      },
    }),
    fetchIndex: vi.fn().mockResolvedValue({
      marketdata: {
        columns: ['SECID', 'CURRENTVALUE', 'LAST'],
        data: [['IMOEX', 3050.4, 3049.9]],
      },
    }),
    fetchFuturesBoard: vi.fn().mockResolvedValue({
      securities: {
        columns: ['SECID', 'ASSETCODE', 'LASTTRADEDATE'],
        data: [
          ['SiU6', 'Si', '2026-09-17'],
          ['EuU6', 'Eu', '2026-09-17'],
          ['BR-9.26', 'BR', '2026-09-01'],
        ],
      },
      marketdata: {
        columns: ['SECID', 'LAST'],
        data: [
          ['SiU6', 82_278],
          ['EuU6', 94_658],
          ['BR-9.26', 68.5],
        ],
      },
    }),
    fetchBinancePrices: vi.fn().mockResolvedValue([
      { symbol: 'BTCUSDT', price: '119500.12' },
      { symbol: 'ETHUSDT', price: '3900.55' },
    ]),
    fetchKrakenTicker: vi.fn().mockImplementation((pair: string) => Promise.resolve({
      pair,
      status: 'online',
      ticker: {
        error: [],
        result: { resultKey: { c: [pair === 'BTCUSD' ? '64000' : pair === 'ETHUSD' ? '1900' : '1.378', '1'] } },
      },
    })),
  } as unknown as QuoteSourcesService;
}

function makeStore(): TickStore & { saveTicks: ReturnType<typeof vi.fn> } {
  return { saveTicks: vi.fn().mockResolvedValue(0) } as unknown as TickStore & {
    saveTicks: ReturnType<typeof vi.fn>;
  };
}

describe('CollectorService', () => {
  it('collects crypto + MOEX during MOEX trading hours and normalizes ts to the minute', async () => {
    const sources = makeSources();
    const store = makeStore();
    const svc = new CollectorService(sources, store);

    const now = new Date(MOEX_OPEN);
    now.setSeconds(37, 123); // ensure normalization to minute start
    await svc.collectOnce(now);

    expect(sources.fetchBinancePrices).not.toHaveBeenCalled();
    expect(sources.fetchKrakenTicker).toHaveBeenCalledWith('BTCUSD');
    expect(sources.fetchKrakenTicker).toHaveBeenCalledWith('ETHUSD');
    expect(sources.fetchKrakenTicker).toHaveBeenCalledWith('TONUSD');
    expect(sources.fetchCbrDailyXml).toHaveBeenCalled();
    expect(sources.fetchCurrencyBatch).toHaveBeenCalledWith(['CNYRUB_TOM', 'GLDRUB_TOM']);
    expect(sources.fetchIndex).toHaveBeenCalledWith('IMOEX');
    expect(sources.fetchFuturesBoard).toHaveBeenCalled();

    const ticks = store.saveTicks.mock.calls[0][0] as {
      instrument: string;
      ts: Date;
      value: number;
      meta?: Record<string, unknown>;
    }[];
    const instruments = ticks.map((t) => t.instrument);
    expect(instruments).toContain('btc');
    expect(instruments).toContain('ton');
    expect(instruments).toContain('usdrub');
    expect(instruments).toContain('eurrub');
    expect(instruments).toContain('usdrub_cbr');
    expect(instruments).toContain('eurrub_cbr');
    expect(instruments).toContain('imoex');
    expect(instruments).toContain('brent');
    expect(ticks.find((tick) => tick.instrument === 'usdrub')).toMatchObject({
      value: 82.278,
      meta: { source: 'moex-futures', assetCode: 'Si', secid: 'SiU6' },
    });
    expect(ticks.find((tick) => tick.instrument === 'eurrub')).toMatchObject({
      value: 94.658,
      meta: { source: 'moex-futures', assetCode: 'Eu', secid: 'EuU6' },
    });
    expect(ticks.find((tick) => tick.instrument === 'usdrub_cbr')).toMatchObject({
      value: 78.698,
      meta: { source: 'cbr', cbrCode: 'USD', effectiveDate: '2026-07-29' },
    });
    // every tick ts is truncated to the minute
    for (const t of ticks) {
      expect(t.ts.getSeconds()).toBe(0);
      expect(t.ts.getMilliseconds()).toBe(0);
    }
  });

  it('collects official rates + 24/7 crypto when MOEX is closed', async () => {
    const sources = makeSources();
    const store = makeStore();
    const svc = new CollectorService(sources, store);

    await svc.collectOnce(new Date(WEEKEND));

    expect(sources.fetchBinancePrices).not.toHaveBeenCalled();
    expect(sources.fetchKrakenTicker).toHaveBeenCalled();
    expect(sources.fetchCbrDailyXml).toHaveBeenCalled();
    expect(sources.fetchCurrencyBatch).not.toHaveBeenCalled();
    expect(sources.fetchIndex).not.toHaveBeenCalled();
    expect(sources.fetchFuturesBoard).not.toHaveBeenCalled();

    const ticks = store.saveTicks.mock.calls[0][0] as { instrument: string }[];
    expect(ticks.every((t) => [
      'usdrub_cbr',
      'eurrub_cbr',
      'btc',
      'eth',
      'ton',
    ].includes(t.instrument))).toBe(true);
  });

  it('survives a source failure and still writes the others', async () => {
    const sources = makeSources();
    (sources.fetchCurrencyBatch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network down'),
    );
    const store = makeStore();
    const svc = new CollectorService(sources, store);

    await expect(svc.collectOnce(new Date(MOEX_OPEN))).resolves.toBeUndefined();
    const ticks = store.saveTicks.mock.calls[0][0] as { instrument: string }[];
    // crypto + index + futures still collected despite currency failure
    expect(ticks.map((t) => t.instrument)).toContain('btc');
    expect(ticks.map((t) => t.instrument)).toContain('usdrub');
    expect(ticks.map((t) => t.instrument)).not.toContain('cnyrub');
  });
});
