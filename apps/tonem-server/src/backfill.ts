import { Prisma, PrismaClient } from '@prisma/client';
import {
  CandleRow,
  FuturesContract,
  parseBinanceKlinesResponse,
  parseFuturesHistoryResponse,
  parseFuturesSecurityDescription,
  parseIssBlockRowCount,
  parseIssCursor,
  parseMoexCandlesResponse,
} from './backfill-parsers';
import { LIVE_INSTRUMENTS, LiveInstrument } from './instruments';

const ISS_BASE = 'https://iss.moex.com/iss';
const BINANCE_BASE = 'https://api.binance.com/api/v3';
const FETCH_TIMEOUT_MS = 30_000;
const FINE_RESOLUTION_MS = 14 * 24 * 60 * 60 * 1000;
const MOEX_PAGE_SIZE = 500;
const BINANCE_LIMIT = 1000;
const CREATE_MANY_BATCH_SIZE = 1000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const HISTORY_START_GRACE_MS = 10 * DAY_MS;
// Binance reports TONUSDT=BREAK; this ticker closeTime is its last real trade.
const BINANCE_HISTORY_END: Readonly<Record<string, number>> = {
  TONUSDT: 1_783_408_319_314,
};

export interface ResolutionRange {
  kind: 'coarse' | 'fine';
  from: Date;
  to: Date;
}

export function binanceHistoryRange(
  symbol: string,
  range: ResolutionRange,
): ResolutionRange | null {
  const lastTrade = BINANCE_HISTORY_END[symbol];
  if (lastTrade === undefined) return range;
  const to = new Date(Math.min(range.to.getTime(), lastTrade + 1));
  return range.from.getTime() < to.getTime() ? { ...range, to } : null;
}

export interface MoexCandleRequest {
  engine: string;
  market: string;
  secid: string;
  interval: number;
  from: Date;
  to: Date;
}

export interface BinanceKlineRequest {
  symbol: string;
  interval: string;
  intervalMs: number;
  from: Date;
  to: Date;
}

export interface BackfillTick {
  instrument: string;
  ts: Date;
  value: number;
  meta: Record<string, unknown>;
}

export interface PersistenceResult {
  eligible: number;
  inserted: number;
  skipped: number;
}

export interface BackfillProgress extends PersistenceResult {
  instrument: string;
  fetched: number;
}

export interface BackfillFailure {
  instrument: string;
  message: string;
}

export interface BackfillResult {
  ok: boolean;
  instruments: BackfillProgress[];
  failures: BackfillFailure[];
  totals: Omit<BackfillProgress, 'instrument'>;
}

export interface BackfillDependencies {
  fetchJson: (url: string) => Promise<unknown>;
  createMany: (ticks: readonly BackfillTick[]) => Promise<number>;
  now: () => Date;
  log: (message: string) => void;
}

export interface BackfillOptions {
  from: Date;
  to: Date;
  fineCutoff?: Date;
  instruments?: readonly LiveInstrument[];
}

export interface FuturesRollRange {
  contract: FuturesContract;
  from: Date;
  to: Date;
}

type FetchJson = (url: string) => Promise<unknown>;

function query(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) search.set(name, String(value));
  return search.toString();
}

function formatMoscowDate(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * MINUTE_MS).toISOString().slice(0, 10);
}

function startOfMoscowDay(date: Date): Date {
  return new Date(`${formatMoscowDate(date)}T00:00:00+03:00`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyProgress(instrument: string): BackfillProgress {
  return { instrument, fetched: 0, eligible: 0, inserted: 0, skipped: 0 };
}

function mergeProgress(target: BackfillProgress, source: Omit<BackfillProgress, 'instrument'>): void {
  target.fetched += source.fetched;
  target.eligible += source.eligible;
  target.inserted += source.inserted;
  target.skipped += source.skipped;
}

function earlierTimestamp(current: Date | undefined, candles: readonly CandleRow[]): Date | undefined {
  if (candles.length === 0) return current;
  const earliest = candles.reduce((minimum, candle) =>
    candle.ts.getTime() < minimum.getTime() ? candle.ts : minimum,
  candles[0].ts);
  return !current || earliest.getTime() < current.getTime() ? earliest : current;
}

function laterTimestamp(current: Date | undefined, candles: readonly CandleRow[]): Date | undefined {
  if (candles.length === 0) return current;
  const latest = candles.reduce((maximum, candle) =>
    candle.ts.getTime() > maximum.getTime() ? candle.ts : maximum,
  candles[0].ts);
  return !current || latest.getTime() > current.getTime() ? latest : current;
}

function assertRangeCoverage(
  source: string,
  from: Date,
  to: Date,
  earliest: Date | undefined,
  latest: Date | undefined,
  graceMs: number,
): void {
  if (!earliest || !latest) {
    throw new Error(`${source} returned no candles for ${from.toISOString()}..${to.toISOString()}`);
  }
  if (to.getTime() - from.getTime() <= graceMs) return;
  if (earliest.getTime() > from.getTime() + graceMs) {
    throw new Error(
      `${source} does not cover requested start ${from.toISOString()} (first value: ${earliest.toISOString()})`,
    );
  }
  if (latest.getTime() < to.getTime() - graceMs) {
    throw new Error(
      `${source} does not cover requested end ${to.toISOString()} (last value: ${latest.toISOString()})`,
    );
  }
}

function assertNoLargeGaps(source: string, candles: readonly CandleRow[], maxGapMs: number): void {
  const ordered = [...candles].sort((left, right) => left.ts.getTime() - right.ts.getTime());
  for (let index = 1; index < ordered.length; index++) {
    const gap = ordered[index].ts.getTime() - ordered[index - 1].ts.getTime();
    if (gap > maxGapMs) {
      throw new Error(
        `${source} has an unexplained gap ${gap}ms after ${ordered[index - 1].ts.toISOString()}`,
      );
    }
  }
}

export function validateCandleCoverage(
  source: string,
  candles: readonly CandleRow[],
  from: Date,
  to: Date,
  graceMs: number,
): void {
  assertRangeCoverage(
    source,
    from,
    to,
    earlierTimestamp(undefined, candles),
    laterTimestamp(undefined, candles),
    graceMs,
  );
  assertNoLargeGaps(source, candles, graceMs);
}

export function backfillResolution(
  source: 'moex' | 'binance',
  kind: ResolutionRange['kind'],
): { interval: number | string; intervalMs: number } {
  if (kind === 'coarse') {
    return { interval: source === 'moex' ? 60 : '1h', intervalMs: 60 * MINUTE_MS };
  }
  return { interval: source === 'moex' ? 1 : '1m', intervalMs: MINUTE_MS };
}

export function planResolutionRanges(from: Date, to: Date, cutoff: Date): ResolutionRange[] {
  if (from.getTime() >= to.getTime()) return [];
  const result: ResolutionRange[] = [];
  const coarseTo = new Date(Math.min(cutoff.getTime(), to.getTime()));
  if (from.getTime() < coarseTo.getTime()) {
    result.push({ kind: 'coarse', from, to: coarseTo });
  }
  const fineFrom = new Date(Math.max(from.getTime(), cutoff.getTime()));
  if (fineFrom.getTime() < to.getTime()) {
    result.push({ kind: 'fine', from: fineFrom, to });
  }
  return result;
}

export function filterCandles(
  candles: readonly CandleRow[],
  from: Date,
  to: Date,
  now: Date,
): CandleRow[] {
  const lower = from.getTime();
  const upper = to.getTime();
  const completedAt = now.getTime();
  return candles.filter((candle) => {
    const ts = candle.ts.getTime();
    return ts >= lower && ts < upper && ts <= completedAt;
  });
}

async function fetchAllIssPages<T>(
  blockName: string,
  makeUrl: (start: number) => string,
  parseRows: (json: unknown) => T[],
  fetchJson: FetchJson,
  fallbackPageSize: number,
): Promise<T[]> {
  const result: T[] = [];
  let start = 0;

  for (;;) {
    const json = await fetchJson(makeUrl(start));
    const rows = parseRows(json);
    const rawRowCount = parseIssBlockRowCount(json, blockName);
    result.push(...rows);
    const cursor = parseIssCursor(json, blockName);

    if (rawRowCount === 0) break;
    if (cursor) {
      const next = cursor.index + rawRowCount;
      if (next >= cursor.total) break;
      if (next <= start) throw new Error(`${blockName} cursor did not advance from ${start}`);
      start = next;
      continue;
    }

    if (rawRowCount < fallbackPageSize) break;
    start += rawRowCount;
  }

  return result;
}

export async function fetchAllMoexCandles(
  request: MoexCandleRequest,
  fetchJson: FetchJson,
): Promise<CandleRow[]> {
  if (request.from.getTime() >= request.to.getTime()) return [];
  return fetchAllIssPages(
    'candles',
    (start) => `${ISS_BASE}/engines/${request.engine}/markets/${request.market}`
      + `/securities/${encodeURIComponent(request.secid)}/candles.json?${query({
        'iss.meta': 'off',
        'iss.only': 'candles,candles.cursor',
        'candles.columns': 'close,end',
        from: formatMoscowDate(request.from),
        till: formatMoscowDate(new Date(request.to.getTime() - 1)),
        interval: request.interval,
        start,
      })}`,
    parseMoexCandlesResponse,
    fetchJson,
    MOEX_PAGE_SIZE,
  );
}

export async function fetchAllBinanceKlines(
  request: BinanceKlineRequest,
  fetchJson: FetchJson,
): Promise<CandleRow[]> {
  if (request.from.getTime() >= request.to.getTime()) return [];
  const result: CandleRow[] = [];
  let startTime = Math.max(0, request.from.getTime() - request.intervalMs + 1);
  const endTime = request.to.getTime() - 1;

  while (startTime <= endTime) {
    const url = `${BINANCE_BASE}/klines?${query({
      symbol: request.symbol,
      interval: request.interval,
      startTime,
      endTime,
      limit: BINANCE_LIMIT,
    })}`;
    const rows = parseBinanceKlinesResponse(await fetchJson(url));
    result.push(...rows);
    if (rows.length === 0 || rows.length < BINANCE_LIMIT) break;
    const nextStart = rows[rows.length - 1].ts.getTime() + 1;
    if (nextStart <= startTime) {
      throw new Error(`Binance cursor did not advance from ${startTime}`);
    }
    startTime = nextStart;
  }

  return result;
}

export async function persistCandles(
  createMany: BackfillDependencies['createMany'],
  instrument: string,
  candles: readonly CandleRow[],
  meta: Record<string, unknown>,
  priceMultiplier = 1,
): Promise<PersistenceResult> {
  if (candles.length === 0) return { eligible: 0, inserted: 0, skipped: 0 };
  const ticks = candles.map((candle) => ({
    instrument,
    ts: candle.ts,
    value: candle.close * priceMultiplier,
    meta,
  }));
  let inserted = 0;
  for (let start = 0; start < ticks.length; start += CREATE_MANY_BATCH_SIZE) {
    const batch = ticks.slice(start, start + CREATE_MANY_BATCH_SIZE);
    const batchInserted = await createMany(batch);
    if (!Number.isInteger(batchInserted) || batchInserted < 0 || batchInserted > batch.length) {
      throw new Error(`Invalid createMany count ${batchInserted} for ${batch.length} ticks`);
    }
    inserted += batchInserted;
  }
  return { eligible: ticks.length, inserted, skipped: ticks.length - inserted };
}

export function buildFuturesRollSchedule(
  contracts: readonly FuturesContract[],
  from: Date,
  to: Date,
): FuturesRollRange[] {
  if (from.getTime() >= to.getTime()) return [];
  const ordered = [...contracts].sort((left, right) => {
    const expiryDifference = left.lastTradeExclusive.getTime() - right.lastTradeExclusive.getTime();
    return expiryDifference === 0 ? left.secid.localeCompare(right.secid) : expiryDifference;
  });
  const schedule: FuturesRollRange[] = [];
  let cursor = from;

  while (cursor.getTime() < to.getTime()) {
    const contract = ordered.find((candidate) =>
      candidate.firstTrade.getTime() <= cursor.getTime()
      && candidate.lastTradeExclusive.getTime() > cursor.getTime());
    if (!contract) {
      throw new Error(`No futures contract covers ${cursor.toISOString()}`);
    }
    const rangeTo = new Date(Math.min(to.getTime(), contract.lastTradeExclusive.getTime()));
    schedule.push({ contract, from: cursor, to: rangeTo });
    cursor = rangeTo;
  }

  return schedule;
}

function planFuturesSnapshotDates(from: Date, to: Date): Date[] {
  const dates = new Map<string, Date>();
  const fromDay = startOfMoscowDay(from);
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(fromDay, offset);
    if (date.getTime() < to.getTime()) dates.set(formatMoscowDate(date), date);
  }

  const fromLabel = formatMoscowDate(fromDay);
  let year = Number(fromLabel.slice(0, 4));
  let monthIndex = Number(fromLabel.slice(5, 7)) + 1;
  while (true) {
    if (monthIndex > 12) {
      year++;
      monthIndex = 1;
    }
    const month = new Date(
      `${year}-${String(monthIndex).padStart(2, '0')}-01T12:00:00+03:00`,
    );
    if (month.getTime() >= to.getTime()) break;
    dates.set(formatMoscowDate(month), month);
    monthIndex++;
  }

  const finalDay = startOfMoscowDay(new Date(to.getTime() - 1));
  dates.set(formatMoscowDate(finalDay), finalDay);
  return [...dates.values()].sort((left, right) => left.getTime() - right.getTime());
}

async function fetchFuturesSnapshot(
  assetCode: string,
  date: Date,
  fetchJson: FetchJson,
): Promise<string[]> {
  return fetchAllIssPages(
    'history',
    (start) => `${ISS_BASE}/history/engines/futures/markets/forts/boards/RFUD/securities.json?${query({
      'iss.meta': 'off',
      'iss.only': 'history,history.cursor',
      'history.columns': 'SECID,ASSETCODE,TRADEDATE,SHORTNAME',
      assetcode: assetCode,
      date: formatMoscowDate(date),
      start,
    })}`,
    (json) => parseFuturesHistoryResponse(json, assetCode),
    fetchJson,
    100,
  );
}

async function discoverFuturesContracts(
  assetCode: string,
  from: Date,
  to: Date,
  fetchJson: FetchJson,
): Promise<FuturesContract[]> {
  const dates = planFuturesSnapshotDates(from, to);
  const secids = new Set<string>();
  let coveredAtStart = false;

  for (let index = 0; index < dates.length; index++) {
    const snapshotSecids = await fetchFuturesSnapshot(assetCode, dates[index], fetchJson);
    if (index < 7 && snapshotSecids.length > 0) coveredAtStart = true;
    for (const secid of snapshotSecids) secids.add(secid);
  }

  if (!coveredAtStart) {
    throw new Error(
      `MOEX has no ${assetCode} futures series at the start of ${formatMoscowDate(from)}`,
    );
  }

  const contracts: FuturesContract[] = [];
  for (const secid of [...secids].sort()) {
    const json = await fetchJson(`${ISS_BASE}/securities/${encodeURIComponent(secid)}.json?${query({
      'iss.meta': 'off',
      'iss.only': 'description',
    })}`);
    const contract = parseFuturesSecurityDescription(json);
    if (!contract) throw new Error(`Incomplete MOEX lifecycle metadata for ${secid}`);
    if (contract.assetCode !== assetCode) {
      throw new Error(`MOEX contract ${secid} has ASSETCODE=${contract.assetCode}, expected ${assetCode}`);
    }
    contracts.push(contract);
  }
  return contracts;
}

async function backfillMoexRange(
  dependencies: BackfillDependencies,
  instrument: string,
  request: MoexCandleRequest,
  now: Date,
  meta: Record<string, unknown>,
  priceMultiplier = 1,
): Promise<Omit<BackfillProgress, 'instrument'> & { firstEligible?: Date; lastEligible?: Date }> {
  const fetched = await fetchAllMoexCandles(request, dependencies.fetchJson);
  const eligible = filterCandles(fetched, request.from, request.to, now);
  assertNoLargeGaps(`MOEX ${request.secid} ${request.interval}m`, eligible, HISTORY_START_GRACE_MS);
  const persistence = await persistCandles(
    dependencies.createMany,
    instrument,
    eligible,
    meta,
    priceMultiplier,
  );
  dependencies.log(
    `  ${instrument}/${request.secid} ${request.interval}m ${request.from.toISOString()}`
      + `..${request.to.toISOString()}: fetched=${fetched.length}`
      + ` inserted=${persistence.inserted} skipped=${persistence.skipped}`,
  );
  const firstEligible = earlierTimestamp(undefined, eligible);
  const lastEligible = laterTimestamp(undefined, eligible);
  return {
    fetched: fetched.length,
    ...persistence,
    ...(firstEligible ? { firstEligible } : {}),
    ...(lastEligible ? { lastEligible } : {}),
  };
}

async function backfillBinanceInstrument(
  instrument: LiveInstrument,
  ranges: readonly ResolutionRange[],
  dependencies: BackfillDependencies,
  progress: BackfillProgress,
): Promise<void> {
  const symbol = instrument.binance?.symbol;
  if (!symbol) throw new Error('Missing Binance symbol');

  for (const range of ranges) {
    const availableRange = binanceHistoryRange(symbol, range);
    if (!availableRange) continue;
    const resolution = backfillResolution('binance', availableRange.kind);
    const interval = String(resolution.interval);
    const fetched = await fetchAllBinanceKlines(
      {
        symbol,
        interval,
        intervalMs: resolution.intervalMs,
        from: availableRange.from,
        to: availableRange.to,
      },
      dependencies.fetchJson,
    );
    const eligible = filterCandles(
      fetched,
      availableRange.from,
      availableRange.to,
      dependencies.now(),
    );
    validateCandleCoverage(
      `Binance ${symbol} ${interval}`,
      eligible,
      availableRange.from,
      availableRange.to,
      resolution.intervalMs + 1_000,
    );
    const persistence = await persistCandles(
      dependencies.createMany,
      instrument.id,
      eligible,
      { source: 'binance', symbol, interval },
    );
    mergeProgress(progress, { fetched: fetched.length, ...persistence });
    dependencies.log(
      `  ${instrument.id} ${interval} ${availableRange.from.toISOString()}..${availableRange.to.toISOString()}`
        + `: fetched=${fetched.length} inserted=${persistence.inserted}`
        + ` skipped=${persistence.skipped}`,
    );
  }
}

async function backfillPlainMoexInstrument(
  instrument: LiveInstrument,
  ranges: readonly ResolutionRange[],
  dependencies: BackfillDependencies,
  progress: BackfillProgress,
): Promise<void> {
  const moex = instrument.moex;
  if (!moex || moex.kind === 'futures') throw new Error('Missing spot MOEX reference');
  const engine = moex.kind === 'currency' ? 'currency' : 'stock';
  const market = moex.kind === 'currency' ? 'selt' : 'index';

  for (const range of ranges) {
    const resolution = backfillResolution('moex', range.kind);
    const interval = Number(resolution.interval);
    const result = await backfillMoexRange(
      dependencies,
      instrument.id,
      { engine, market, secid: moex.secid, interval, from: range.from, to: range.to },
      dependencies.now(),
      { source: `moex-${moex.kind}`, secid: moex.secid, interval },
    );
    assertRangeCoverage(
      `MOEX ${moex.secid} ${interval}m`,
      range.from,
      range.to,
      result.firstEligible,
      result.lastEligible,
      HISTORY_START_GRACE_MS,
    );
    mergeProgress(progress, result);
  }
}

async function backfillFuturesInstrument(
  instrument: LiveInstrument,
  ranges: readonly ResolutionRange[],
  dependencies: BackfillDependencies,
  progress: BackfillProgress,
): Promise<void> {
  const coverage = new Map<ResolutionRange, { first?: Date; last?: Date }>(
    ranges.map((range) => [range, {}]),
  );
  const moex = instrument.moex;
  if (!moex || moex.kind !== 'futures') throw new Error('Missing MOEX futures reference');
  const requestedFrom = ranges[0]?.from;
  const requestedTo = ranges[ranges.length - 1]?.to;
  if (!requestedFrom || !requestedTo) return;

  const contracts = await discoverFuturesContracts(
    moex.assetCode,
    requestedFrom,
    requestedTo,
    dependencies.fetchJson,
  );
  const schedule = buildFuturesRollSchedule(contracts, requestedFrom, requestedTo);
  dependencies.log(`  ${instrument.id}: ${contracts.length} historical contracts, ${schedule.length} roll segments`);

  for (const segment of schedule) {
    for (const range of ranges) {
      const from = new Date(Math.max(segment.from.getTime(), range.from.getTime()));
      const to = new Date(Math.min(segment.to.getTime(), range.to.getTime()));
      if (from.getTime() >= to.getTime()) continue;
      const resolution = backfillResolution('moex', range.kind);
      const interval = Number(resolution.interval);
      const result = await backfillMoexRange(
        dependencies,
        instrument.id,
        {
          engine: 'futures',
          market: 'forts',
          secid: segment.contract.secid,
          interval,
          from,
          to,
        },
        dependencies.now(),
        {
          source: 'moex-futures',
          assetCode: moex.assetCode,
          secid: segment.contract.secid,
          interval,
          ...(moex.priceMultiplier !== undefined
            ? { priceMultiplier: moex.priceMultiplier }
            : {}),
        },
        moex.priceMultiplier,
      );
      if (to.getTime() - from.getTime() > HISTORY_START_GRACE_MS) {
        assertRangeCoverage(
          `MOEX ${moex.assetCode} futures ${segment.contract.secid}`,
          from,
          to,
          result.firstEligible,
          result.lastEligible,
          HISTORY_START_GRACE_MS,
        );
      }
      const rangeCoverage = coverage.get(range)!;
      if (result.firstEligible
        && (!rangeCoverage.first || result.firstEligible.getTime() < rangeCoverage.first.getTime())) {
        rangeCoverage.first = result.firstEligible;
      }
      if (result.lastEligible
        && (!rangeCoverage.last || result.lastEligible.getTime() > rangeCoverage.last.getTime())) {
        rangeCoverage.last = result.lastEligible;
      }
      mergeProgress(progress, result);
    }
  }
  for (const range of ranges) {
    const rangeCoverage = coverage.get(range)!;
    assertRangeCoverage(
      `MOEX ${moex.assetCode} futures ${range.kind}`,
      range.from,
      range.to,
      rangeCoverage.first,
      rangeCoverage.last,
      HISTORY_START_GRACE_MS,
    );
  }
}

async function backfillInstrument(
  instrument: LiveInstrument,
  ranges: readonly ResolutionRange[],
  dependencies: BackfillDependencies,
  progress: BackfillProgress,
): Promise<void> {
  if (instrument.binance) {
    await backfillBinanceInstrument(instrument, ranges, dependencies, progress);
    return;
  }
  if (instrument.moex?.kind === 'futures') {
    await backfillFuturesInstrument(instrument, ranges, dependencies, progress);
    return;
  }
  if (instrument.moex) {
    await backfillPlainMoexInstrument(instrument, ranges, dependencies, progress);
    return;
  }
  throw new Error('Instrument has no backfill source');
}

export async function runBackfill(
  options: BackfillOptions,
  dependencies: BackfillDependencies,
): Promise<BackfillResult> {
  if (options.from.getTime() >= options.to.getTime()) {
    throw new Error('Backfill --from must be earlier than --to');
  }
  const cutoff = options.fineCutoff
    ?? new Date(options.to.getTime() - FINE_RESOLUTION_MS);
  const ranges = planResolutionRanges(options.from, options.to, cutoff);
  const instruments = options.instruments ?? LIVE_INSTRUMENTS;
  const completed: BackfillProgress[] = [];
  const failures: BackfillFailure[] = [];

  for (const instrument of instruments) {
    const progress = emptyProgress(instrument.id);
    dependencies.log(`\n[${instrument.id}] starting`);
    try {
      await backfillInstrument(instrument, ranges, dependencies, progress);
      dependencies.log(
        `[${instrument.id}] done: fetched=${progress.fetched} eligible=${progress.eligible}`
          + ` inserted=${progress.inserted} skipped=${progress.skipped}`,
      );
    } catch (error) {
      const message = errorMessage(error);
      failures.push({ instrument: instrument.id, message });
      dependencies.log(
        `[${instrument.id}] FAILED: ${message}`
          + ` (partial inserted=${progress.inserted} skipped=${progress.skipped})`,
      );
    }
    completed.push(progress);
  }

  const totals = completed.reduce<Omit<BackfillProgress, 'instrument'>>(
    (sum, item) => ({
      fetched: sum.fetched + item.fetched,
      eligible: sum.eligible + item.eligible,
      inserted: sum.inserted + item.inserted,
      skipped: sum.skipped + item.skipped,
    }),
    { fetched: 0, eligible: 0, inserted: 0, skipped: 0 },
  );
  return { ok: failures.length === 0, instruments: completed, failures, totals };
}

function parseCliDate(value: string | undefined, name: string): Date | undefined {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error(`Invalid date for --${name}: ${value}`);
  return new Date(timestamp);
}

export function parseCliArgs(args: readonly string[]): { from?: string; to?: string } {
  const values: { from?: string; to?: string } = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag !== '--from' && flag !== '--to') {
      throw new Error(`Unknown backfill argument: ${flag}`);
    }
    const name = flag.slice(2) as 'from' | 'to';
    if (values[name] !== undefined) throw new Error(`Duplicate backfill argument: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values[name] = value;
  }
  return values;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runCli(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const now = new Date();
  const parsedArgs = parseCliArgs(args);
  const from = parseCliDate(parsedArgs.from, 'from')
    ?? new Date(now.getTime() - 366 * DAY_MS);
  const to = parseCliDate(parsedArgs.to, 'to') ?? now;
  const fineCutoff = new Date(to.getTime() - FINE_RESOLUTION_MS);
  const prisma = new PrismaClient();

  console.log('Tonem history backfill');
  console.log(`from=${from.toISOString()} to=${to.toISOString()}`);
  console.log(`coarse=[from,${fineCutoff.toISOString()}) fine=[${fineCutoff.toISOString()},to)`);
  console.log(`instruments=${LIVE_INSTRUMENTS.length}`);

  try {
    await prisma.$connect();
    const result = await runBackfill(
      { from, to, fineCutoff },
      {
        fetchJson,
        now: () => new Date(),
        log: (message) => console.log(message),
        createMany: async (ticks) => {
          const inserted = await prisma.tick.createMany({
            data: ticks.map((tick) => ({
              instrument: tick.instrument,
              ts: tick.ts,
              value: tick.value,
              meta: tick.meta as Prisma.InputJsonValue,
            })),
            skipDuplicates: true,
          });
          return inserted.count;
        },
      },
    );

    console.log('\nBackfill summary');
    console.log(
      `fetched=${result.totals.fetched} eligible=${result.totals.eligible}`
        + ` inserted=${result.totals.inserted} skipped=${result.totals.skipped}`,
    );
    if (result.failures.length > 0) {
      console.error(`failures=${result.failures.length}`);
      for (const failure of result.failures) {
        console.error(`- ${failure.instrument}: ${failure.message}`);
      }
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(`Backfill fatal error: ${errorMessage(error)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(`Backfill fatal error: ${errorMessage(error)}`);
      process.exitCode = 1;
    });
}
