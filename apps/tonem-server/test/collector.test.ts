import { describe, expect, it, vi } from 'vitest';
import { CollectorService } from '../src/collector.service';
import { QuoteSourcesService } from '../src/quote-sources';
import { TickStore } from '../src/tick-store';

// A weekday during all MOEX trading windows: 2026-07-28 is a Tuesday, 12:00 MSK.
const MOEX_OPEN = new Date('2026-07-28T09:00:00.000Z'); // 12:00 MSK
// A weekend — MOEX closed, crypto still 24/7. 2026-08-01 is a Saturday.
const WEEKEND = new Date('2026-08-01T12:00:00.000Z'); // 15:00 MSK Saturday

function makeSources(): QuoteSourcesService {
  return {
    fetchCurrencyBatch: vi.fn().mockResolvedValue({
      marketdata: {
        columns: ['SECID', 'LAST', 'MARKETPRICE'],
        data: [['USD000UTSTOM', 91.25, 91.2]],
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
        data: [['BR-9.26', 'BR', '2026-09-01']],
      },
      marketdata: {
        columns: ['SECID', 'LAST'],
        data: [['BR-9.26', 68.5]],
      },
    }),
    fetchBinancePrices: vi.fn().mockResolvedValue([
      { symbol: 'BTCUSDT', price: '119500.12' },
      { symbol: 'ETHUSDT', price: '3900.55' },
    ]),
    fetchKrakenTicker: vi.fn().mockResolvedValue({
      pair: 'TONUSD',
      status: 'online',
      ticker: { error: [], result: { TONUSD: { c: ['1.378', '83.775'] } } },
    }),
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

    expect(sources.fetchBinancePrices).toHaveBeenCalledWith(['BTCUSDT', 'ETHUSDT']);
    expect(sources.fetchKrakenTicker).toHaveBeenCalledWith('TONUSD');
    expect(sources.fetchCurrencyBatch).toHaveBeenCalled();
    expect(sources.fetchIndex).toHaveBeenCalledWith('IMOEX');
    expect(sources.fetchFuturesBoard).toHaveBeenCalled();

    const ticks = store.saveTicks.mock.calls[0][0] as { instrument: string; ts: Date }[];
    const instruments = ticks.map((t) => t.instrument);
    expect(instruments).toContain('btc');
    expect(instruments).toContain('ton');
    expect(instruments).toContain('usdrub');
    expect(instruments).toContain('imoex');
    expect(instruments).toContain('brent');
    // every tick ts is truncated to the minute
    for (const t of ticks) {
      expect(t.ts.getSeconds()).toBe(0);
      expect(t.ts.getMilliseconds()).toBe(0);
    }
  });

  it('collects only crypto when MOEX is closed (weekend)', async () => {
    const sources = makeSources();
    const store = makeStore();
    const svc = new CollectorService(sources, store);

    await svc.collectOnce(new Date(WEEKEND));

    expect(sources.fetchBinancePrices).toHaveBeenCalled();
    expect(sources.fetchKrakenTicker).toHaveBeenCalled();
    expect(sources.fetchCurrencyBatch).not.toHaveBeenCalled();
    expect(sources.fetchIndex).not.toHaveBeenCalled();
    expect(sources.fetchFuturesBoard).not.toHaveBeenCalled();

    const ticks = store.saveTicks.mock.calls[0][0] as { instrument: string }[];
    expect(ticks.every((t) => ['btc', 'eth', 'ton'].includes(t.instrument))).toBe(true);
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
    expect(ticks.map((t) => t.instrument)).not.toContain('usdrub');
  });
});
