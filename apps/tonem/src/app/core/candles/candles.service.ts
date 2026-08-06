import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, switchMap, catchError } from 'rxjs';
import { Instrument, moexAssetCode } from '../instruments/instrument.model';
import { Candle, IntradayCurve } from './candle.model';
import { candleSource, moexMarketKind } from './candle-source';
import { decideSession } from './candle-session';
import { parseMoexCandles } from './moex-candles.parser';
import { parseBinanceKlines } from './binance-klines.parser';
import { parseKrakenOhlc } from './kraken-ohlc.parser';

const ISS_BASE = 'https://iss.moex.com/iss';
const BINANCE_BASE = 'https://api.binance.com/api/v3';
const KRAKEN_BASE = 'https://api.kraken.com/0/public';

/**
 * 10-минутные свечи MOEX ISS (достаточно плотно для спарклайна, не тяжело).
 * Значения interval у ISS: 1, 10, 60, 24(день), 7(неделя), 31(месяц), 4(квартал).
 */
const MOEX_INTERVAL = 10;
const BINANCE_INTERVAL = '5m';
const BINANCE_LIMIT = 288; // сутки при 5m

/**
 * Загрузка внутридневной кривой (спарклайн) для инструмента.
 * Выбирает источник (MOEX ISS candles / Binance klines), применяет
 * ночное правило (закрытый рынок → последняя завершённая сессия) и
 * приводит ответ к нормализованному Candle[].
 */
@Injectable({ providedIn: 'root' })
export class CandlesService {
  private readonly http = inject(HttpClient);

  /**
   * Внутридневная кривая инструмента. Не бросает: сетевые ошибки и
   * неизвестные инструменты дают пустую кривую (session по решению правила).
   */
  intraday(instrument: Instrument, now: Date = new Date()): Observable<IntradayCurve> {
    const decision = decideSession(moexMarketKind(instrument), now);
    const source = candleSource(instrument);
    if (!source) {
      return of({ candles: [], session: decision.session });
    }

    if (source.kind === 'binance') {
      return this.fetchBinance(source.symbol).pipe(
        map((candles) => ({ candles, session: 'current' as const })),
      );
    }
    if (source.kind === 'kraken') {
      return this.fetchKraken(source.pair).pipe(
        map((candles) => ({ candles, session: 'current' as const })),
      );
    }

    // MOEX: currency/index — secid готов; futures — сначала резолвим контракт.
    const priceMultiplier = instrument.moex?.kind === 'futures'
      ? (instrument.moex.priceMultiplier ?? 1)
      : 1;
    return this.resolveMoexSecid(instrument, source, now).pipe(
      switchMap((secid) =>
        secid === null
          ? of([])
          : this.fetchMoexCandles(
              source.engine,
              source.market,
              secid,
              decision.fromYmd,
              priceMultiplier,
            ),
      ),
      map((candles) => ({ candles, session: decision.session })),
    );
  }

  /**
   * Конкретный SECID для MOEX-candles.
   * currency/index — из реестра; futures — ближайший контракт RFUD по assetCode,
   * тем же правилом, что и котировки (переиспользуем листинг доски FORTS).
   */
  private resolveMoexSecid(
    instrument: Instrument,
    source: { secid: string | null; assetCode: string | null },
    now: Date,
  ): Observable<string | null> {
    if (source.secid !== null) return of(source.secid);
    const assetCode = source.assetCode ?? moexAssetCode(instrument.moex!);
    if (!assetCode) return of(null);
    return this.fetchFuturesBoard().pipe(
      map((json) => nearestFuturesSecid(json, assetCode, now)),
    );
  }

  private fetchMoexCandles(
    engine: string,
    market: string,
    secid: string,
    fromYmd: string,
    priceMultiplier: number,
  ): Observable<Candle[]> {
    return this.http
      .get(`${ISS_BASE}/engines/${engine}/markets/${market}/securities/${secid}/candles.json`, {
        params: {
          'iss.meta': 'off',
          from: fromYmd,
          interval: String(MOEX_INTERVAL),
        },
      })
      .pipe(
        map((json) => parseMoexCandles(json, priceMultiplier)),
        catchError(() => of([])),
      );
  }

  private fetchBinance(symbol: string): Observable<Candle[]> {
    return this.http
      .get(`${BINANCE_BASE}/klines`, {
        params: { symbol, interval: BINANCE_INTERVAL, limit: String(BINANCE_LIMIT) },
      })
      .pipe(
        map((json) => parseBinanceKlines(json)),
        catchError(() => of([])),
      );
  }

  private fetchKraken(pair: string): Observable<Candle[]> {
    return this.http
      .get(`${KRAKEN_BASE}/OHLC`, { params: { pair, interval: '5' } })
      .pipe(
        map(parseKrakenOhlc),
        catchError(() => of([])),
      );
  }

  private fetchFuturesBoard(): Observable<unknown> {
    return this.http
      .get(`${ISS_BASE}/engines/futures/markets/forts/boards/RFUD/securities.json`, {
        params: {
          'iss.meta': 'off',
          'iss.only': 'securities',
          'securities.columns': 'SECID,ASSETCODE,LASTTRADEDATE',
        },
      })
      .pipe(catchError(() => of(null)));
  }
}

/**
 * Ближайший контракт RFUD по assetCode: экспирация не раньше сегодня (МСК),
 * иначе ближайшая вообще. Чистая функция — вынесена, чтобы тестировать
 * выбор контракта без сети. Кривой ответ → null.
 */
export function nearestFuturesSecid(json: unknown, assetCode: string, now: Date): string | null {
  const sec = (json as { securities?: { columns: string[]; data: unknown[][] } })?.securities;
  if (!sec || !Array.isArray(sec.columns) || !Array.isArray(sec.data)) return null;
  const colSecid = sec.columns.indexOf('SECID');
  const colAsset = sec.columns.indexOf('ASSETCODE');
  const colExpiry = sec.columns.indexOf('LASTTRADEDATE');
  if (colSecid < 0 || colAsset < 0 || colExpiry < 0) return null;

  const todayYmd = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const candidates = sec.data
    .filter((row) => Array.isArray(row) && row[colAsset] === assetCode)
    .map((row) => ({ secid: String(row[colSecid]), expiry: String(row[colExpiry] ?? '') }));
  if (candidates.length === 0) return null;

  const tradable = candidates.filter((c) => c.expiry >= todayYmd);
  const pool = tradable.length > 0 ? tradable : candidates;
  return [...pool].sort((a, b) => a.expiry.localeCompare(b.expiry))[0].secid;
}
