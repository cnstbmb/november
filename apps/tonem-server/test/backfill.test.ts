import { describe, expect, it, vi } from 'vitest';
import {
  BackfillDependencies,
  backfillResolution,
  buildFuturesRollSchedule,
  fetchAllBinanceKlines,
  fetchAllMoexCandles,
  filterCandles,
  parseCliArgs,
  persistCandles,
  planResolutionRanges,
  runBackfill,
  validateCandleCoverage,
} from '../src/backfill';
import {
  FuturesContract,
  parseBinanceKlinesResponse,
  parseFuturesHistoryResponse,
  parseMoexCandlesResponse,
} from '../src/backfill-parsers';
import { LiveInstrument } from '../src/instruments';

const minute = 60_000;
const hour = 60 * minute;

function binanceKline(openTime: number, intervalMs: number, close = '42'): unknown[] {
  return [
    openTime,
    '1',
    '2',
    '0.5',
    close,
    '10',
    openTime + intervalMs - 1,
    '20',
    1,
    '5',
    '10',
    '0',
  ];
}

function moexResponse(
  rows: unknown[][],
  cursor?: { index: number; total: number; pageSize: number },
): unknown {
  return {
    candles: {
      columns: ['close', 'end'],
      data: rows,
    },
    ...(cursor
      ? {
          'candles.cursor': {
            columns: ['INDEX', 'TOTAL', 'PAGESIZE'],
            data: [[cursor.index, cursor.total, cursor.pageSize]],
          },
        }
      : {}),
  };
}

describe('backfill range planning', () => {
  it('plans non-overlapping coarse [from, cutoff) and fine [cutoff, to) ranges', () => {
    const from = new Date('2025-01-01T00:00:00.000Z');
    const cutoff = new Date('2025-12-15T12:34:56.000Z');
    const to = new Date('2026-01-01T00:00:00.000Z');

    expect(planResolutionRanges(from, to, cutoff)).toEqual([
      { kind: 'coarse', from, to: cutoff },
      { kind: 'fine', from: cutoff, to },
    ]);
  });

  it('uses true one-minute resolution for the recent range', () => {
    expect(backfillResolution('moex', 'fine')).toEqual({ interval: 1, intervalMs: minute });
    expect(backfillResolution('binance', 'fine')).toEqual({ interval: '1m', intervalMs: minute });
    expect(backfillResolution('moex', 'coarse')).toEqual({ interval: 60, intervalMs: hour });
    expect(backfillResolution('binance', 'coarse')).toEqual({ interval: '1h', intervalMs: hour });
  });

  it('does not manufacture an empty coarse range when the request starts after cutoff', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-03T00:00:00.000Z');
    const cutoff = new Date('2025-12-15T00:00:00.000Z');

    expect(planResolutionRanges(from, to, cutoff)).toEqual([
      { kind: 'fine', from, to },
    ]);
  });
});

describe('candle timestamps and exact boundaries', () => {
  it('timestamps Binance values at closeTime, never openTime', () => {
    const result = parseBinanceKlinesResponse([
      binanceKline(1_722_150_000_000, 5 * minute, '1.55'),
    ]);

    expect(result).toEqual([
      {
        openTs: new Date(1_722_150_000_000),
        ts: new Date(1_722_150_000_000 + 5 * minute - 1),
        close: 1.55,
      },
    ]);
  });

  it('keeps exactly [from, to) and excludes candles which have not closed yet', () => {
    const from = new Date('2026-01-01T10:00:00.000Z');
    const to = new Date('2026-01-01T11:00:00.000Z');
    const now = new Date('2026-01-01T10:45:00.000Z');
    const candles = [
      { ts: new Date('2026-01-01T09:59:59.999Z'), close: 1 },
      { ts: new Date('2026-01-01T10:00:00.000Z'), close: 2 },
      { ts: new Date('2026-01-01T10:44:59.999Z'), close: 3 },
      { ts: new Date('2026-01-01T10:45:00.001Z'), close: 4 },
      { ts: new Date('2026-01-01T11:00:00.000Z'), close: 5 },
    ];

    expect(filterCandles(candles, from, to, now).map((c) => c.close)).toEqual([2, 3]);
  });

  it('parses MOEX candle close time in Moscow time', () => {
    const result = parseMoexCandlesResponse(
      moexResponse([[1.55, '2026-07-28 10:10:00']]),
    );

    expect(result[0]).toEqual({
      ts: new Date('2026-07-28T07:10:00.000Z'),
      close: 1.55,
    });
  });
});

describe('MOEX ISS pagination', () => {
  it('uses ISS start/cursor until a result larger than 1000 rows is exhausted', async () => {
    const starts: number[] = [];
    const total = 1_201;
    const fetchJson = vi.fn(async (url: string) => {
      const start = Number(new URL(url).searchParams.get('start') ?? '0');
      starts.push(start);
      const size = Math.min(500, total - start);
      const rows = Array.from({ length: size }, (_, index) => {
        const timestamp = new Date(Date.UTC(2025, 0, 1) + (start + index) * hour);
        return [
          start + index + 0.5,
          timestamp.toISOString().slice(0, 19).replace('T', ' '),
        ];
      });
      return moexResponse(rows, { index: start, total, pageSize: 500 });
    });

    const candles = await fetchAllMoexCandles(
      {
        engine: 'stock',
        market: 'index',
        secid: 'IMOEX',
        interval: 60,
        from: new Date('2025-01-01T00:00:00.000Z'),
        to: new Date('2026-01-01T00:00:00.000Z'),
      },
      fetchJson,
    );

    expect(candles).toHaveLength(total);
    expect(starts).toEqual([0, 500, 1000]);
  });

  it('also exhausts fixed 500-row candle pages when ISS omits a cursor block', async () => {
    const starts: number[] = [];
    const fetchJson = vi.fn(async (url: string) => {
      const start = Number(new URL(url).searchParams.get('start') ?? '0');
      starts.push(start);
      const size = start < 1_000 ? 500 : 0;
      return moexResponse(
        Array.from({ length: size }, (_, index) => [
          start + index + 1,
          '2025-01-01 10:00:00',
        ]),
      );
    });

    const candles = await fetchAllMoexCandles(
      {
        engine: 'stock',
        market: 'index',
        secid: 'IMOEX',
        interval: 60,
        from: new Date('2025-01-01T00:00:00.000Z'),
        to: new Date('2025-02-01T00:00:00.000Z'),
      },
      fetchJson,
    );

    expect(candles).toHaveLength(1_000);
    expect(starts).toEqual([0, 500, 1000]);
  });
});

describe('Binance pagination', () => {
  it('advances from the last closeTime + 1 without a gap', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + 1_002 * minute);
    const requestedStarts: number[] = [];
    let calls = 0;
    const fetchJson = vi.fn(async (url: string) => {
      const parsed = new URL(url);
      requestedStarts.push(Number(parsed.searchParams.get('startTime')));
      calls++;
      if (calls === 1) {
        const firstOpen = from.getTime() - minute + 1;
        return Array.from({ length: 1_000 }, (_, index) =>
          binanceKline(firstOpen + index * minute, minute),
        );
      }
      if (calls === 2) {
        return [binanceKline(requestedStarts[1], minute)];
      }
      return [];
    });

    const candles = await fetchAllBinanceKlines(
      {
        symbol: 'BTCUSDT',
        interval: '1m',
        intervalMs: minute,
        from,
        to,
      },
      fetchJson,
    );

    expect(candles).toHaveLength(1_001);
    expect(requestedStarts[1]).toBe(
      candles[999].ts.getTime() + 1,
    );
    expect(requestedStarts[1]).toBe(
      (candles[999].openTs as Date).getTime() + minute,
    );
  });
});

describe('idempotent batch persistence', () => {
  it('uses a skip-duplicates batch, preserves existing ticks, and reports honest counts', async () => {
    const createMany = vi.fn(async () => 1);
    const candles = [
      { ts: new Date('2026-01-01T10:00:00.000Z'), close: 10 },
      { ts: new Date('2026-01-01T11:00:00.000Z'), close: 11 },
    ];

    const result = await persistCandles(
      createMany,
      'brent',
      candles,
      { source: 'moex-futures', secid: 'BRF6' },
    );

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith([
      {
        instrument: 'brent',
        ts: candles[0].ts,
        value: 10,
        meta: { source: 'moex-futures', secid: 'BRF6' },
      },
      {
        instrument: 'brent',
        ts: candles[1].ts,
        value: 11,
        meta: { source: 'moex-futures', secid: 'BRF6' },
      },
    ]);
    expect(result).toEqual({ eligible: 2, inserted: 1, skipped: 1 });
  });

  it('chunks minute history into bounded createMany batches', async () => {
    const createMany = vi.fn(async (ticks: readonly unknown[]) => ticks.length);
    const candles = Array.from({ length: 2_001 }, (_, index) => ({
      ts: new Date(Date.UTC(2026, 0, 1) + index * minute),
      close: index,
    }));

    const result = await persistCandles(createMany, 'btc', candles, { source: 'binance' });

    expect(createMany.mock.calls.map(([ticks]) => ticks.length)).toEqual([1_000, 1_000, 1]);
    expect(result).toEqual({ eligible: 2_001, inserted: 2_001, skipped: 0 });
  });
});

describe('coverage validation', () => {
  it('rejects an empty or internally gapped range', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-02-01T00:00:00.000Z');
    const grace = 10 * 24 * hour;

    expect(() => validateCandleCoverage('middle roll', [], from, to, grace))
      .toThrow('returned no candles');
    expect(() => validateCandleCoverage(
      'gapped roll',
      [
        { ts: new Date('2026-01-02T00:00:00.000Z'), close: 1 },
        { ts: new Date('2026-01-30T00:00:00.000Z'), close: 2 },
      ],
      from,
      to,
      grace,
    )).toThrow('unexplained gap');
  });
});

describe('historical futures discovery and roll', () => {
  it('keeps only the exact requested ASSETCODE and excludes calendar spreads', () => {
    const json = {
      history: {
        columns: ['SECID', 'ASSETCODE', 'TRADEDATE', 'SHORTNAME'],
        data: [
          ['BRH6', 'BR', '2026-01-05', 'BR-3.26'],
          ['BRH6BRM6', '', '2026-01-05', 'BR-3.26-6.26'],
          ['W4H6', 'WHEAT', '2026-01-05', 'WHEAT-3.26'],
        ],
      },
    };

    expect(parseFuturesHistoryResponse(json, 'BR')).toEqual(['BRH6']);
  });

  it('turns overlapping listed contracts into a deterministic non-overlapping nearest-expiry roll', () => {
    const contracts: FuturesContract[] = [
      {
        secid: 'BRH6',
        assetCode: 'BR',
        firstTrade: new Date('2025-01-01T00:00:00.000Z'),
        lastTradeExclusive: new Date('2026-03-16T00:00:00.000Z'),
      },
      {
        secid: 'BRM6',
        assetCode: 'BR',
        firstTrade: new Date('2025-06-01T00:00:00.000Z'),
        lastTradeExclusive: new Date('2026-06-16T00:00:00.000Z'),
      },
    ];
    const from = new Date('2026-02-01T00:00:00.000Z');
    const to = new Date('2026-04-01T00:00:00.000Z');

    expect(buildFuturesRollSchedule(contracts, from, to)).toEqual([
      { contract: contracts[0], from, to: contracts[0].lastTradeExclusive },
      {
        contract: contracts[1],
        from: contracts[0].lastTradeExclusive,
        to,
      },
    ]);
  });
});

describe('strict CLI arguments', () => {
  it('accepts only one value for each known flag', () => {
    expect(parseCliArgs(['--from', '2025-01-01', '--to', '2026-01-01'])).toEqual({
      from: '2025-01-01',
      to: '2026-01-01',
    });
    expect(() => parseCliArgs(['--form', '2025-01-01'])).toThrow('Unknown backfill argument');
    expect(() => parseCliArgs(['--from=2025-01-01'])).toThrow('Unknown backfill argument');
    expect(() => parseCliArgs(['--from', '2025-01-01', '--from', '2025-02-01']))
      .toThrow('Duplicate backfill argument');
    expect(() => parseCliArgs(['--to'])).toThrow('Missing value');
  });
});

describe('injected runner failures', () => {
  it('continues other instruments, aggregates failures, and returns a failed result', async () => {
    const instruments: LiveInstrument[] = [
      { id: 'bad', market: 'crypto', binance: { symbol: 'BADUSDT' } },
      { id: 'good', market: 'crypto', binance: { symbol: 'GOODUSDT' } },
    ];
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-01T02:00:00.000Z');
    const logs: string[] = [];
    let goodCalls = 0;
    const dependencies: BackfillDependencies = {
      now: () => new Date('2026-01-02T00:00:00.000Z'),
      log: (message) => logs.push(message),
      fetchJson: async (url) => {
        if (url.includes('BADUSDT')) throw new Error('upstream exploded');
        goodCalls++;
        return goodCalls === 1
          ? Array.from({ length: 120 }, (_, index) =>
              binanceKline(from.getTime() - minute + 1 + index * minute, minute))
          : [];
      },
      createMany: async (ticks) => ticks.length,
    };

    const result = await runBackfill(
      {
        from,
        to,
        fineCutoff: from,
        instruments,
      },
      dependencies,
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      { instrument: 'bad', message: 'upstream exploded' },
    ]);
    expect(result.instruments.find((item) => item.instrument === 'good')).toMatchObject({
      inserted: 120,
      skipped: 0,
    });
    expect(logs.some((line) => line.includes('bad') && line.includes('upstream exploded'))).toBe(true);
  });

  it('fails explicitly when a source starts well after the requested history', async () => {
    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date('2025-03-01T00:00:00.000Z');
    let calls = 0;
    const result = await runBackfill(
      {
        from,
        to,
        fineCutoff: to,
        instruments: [
          { id: 'late', market: 'crypto', binance: { symbol: 'LATEUSDT' } },
        ],
      },
      {
        now: () => to,
        log: () => undefined,
        createMany: async (ticks) => ticks.length,
        fetchJson: async () => {
          calls++;
          return calls === 1
            ? [binanceKline(from.getTime() + 30 * 24 * hour, hour)]
            : [];
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ instrument: 'late' });
    expect(result.failures[0].message).toContain('does not cover requested start');
  });

  it('keeps partial insert and skip counts honest when a later range fails', async () => {
    const from = new Date('2025-01-01T00:00:00.000Z');
    const cutoff = new Date('2025-01-15T00:00:00.000Z');
    const to = new Date('2025-02-01T00:00:00.000Z');
    let calls = 0;
    const result = await runBackfill(
      {
        from,
        to,
        fineCutoff: cutoff,
        instruments: [
          { id: 'partial', market: 'crypto', binance: { symbol: 'PARTIALUSDT' } },
        ],
      },
      {
        now: () => to,
        log: () => undefined,
        createMany: async () => 1,
        fetchJson: async () => {
          calls++;
          if (calls === 1) {
            return Array.from({ length: 14 * 24 }, (_, index) =>
              binanceKline(from.getTime() - hour + 1 + index * hour, hour));
          }
          throw new Error('fine range failed');
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      { instrument: 'partial', message: 'fine range failed' },
    ]);
    expect(result.instruments).toContainEqual({
      instrument: 'partial',
      fetched: 336,
      eligible: 336,
      inserted: 1,
      skipped: 335,
    });
    expect(result.totals).toEqual({ fetched: 336, eligible: 336, inserted: 1, skipped: 335 });
  });
});
