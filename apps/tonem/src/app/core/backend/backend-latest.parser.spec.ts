import { describe, expect, it } from 'vitest';
import {
  parseBackendCbrQuotes,
  parseBackendFallbackQuotes,
  parseBackendKrakenQuotes,
} from './backend-latest.parser';

describe('parseBackendKrakenQuotes', () => {
  it('accepts only Kraken-backed TON with a valid timestamp', () => {
    expect(
      parseBackendKrakenQuotes({
        ton: {
          ts: '2026-08-06T18:58:00.000Z',
          value: 1.378,
          meta: { source: 'kraken', pair: 'TONUSD' },
        },
        btc: {
          ts: '2026-08-06T18:58:00.000Z',
          value: 64000,
          meta: { source: 'binance', symbol: 'BTCUSDT' },
        },
      }),
    ).toEqual([
      {
        instrumentId: 'ton',
        value: 1.378,
        time: new Date('2026-08-06T18:58:00.000Z'),
        systime: new Date('2026-08-06T18:58:00.000Z'),
      },
    ]);
  });

  it('rejects the stale legacy Binance TON row', () => {
    expect(
      parseBackendKrakenQuotes({
        ton: {
          ts: '2026-08-06T18:58:00.000Z',
          value: 1.6,
          meta: { source: 'binance', symbol: 'TONUSDT' },
        },
      }),
    ).toEqual([]);
  });

  it('keeps Kraken and official-rate fallback quotes while ignoring legacy CBR rows', () => {
    expect(parseBackendFallbackQuotes({
      usdrub: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 80.25,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
      btc: {
        ts: '2026-08-06T18:58:25.000Z',
        value: 64_000,
        meta: { source: 'kraken', pair: 'BTCUSD' },
      },
      usdrub_cbr: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 80.25,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
      injected: {
        ts: '2026-08-06T18:58:25.000Z',
        value: 1,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
    })).toEqual({
      kraken: [{
        instrumentId: 'btc',
        value: 64_000,
        time: new Date('2026-08-06T18:58:25.000Z'),
        systime: new Date('2026-08-06T18:58:25.000Z'),
      }],
      cbr: [{
        instrumentId: 'usdrub_cbr',
        value: 80.25,
        time: new Date('2026-08-06T18:58:00.000Z'),
        systime: new Date('2026-08-06T18:58:00.000Z'),
      }],
    });
  });
});

describe('parseBackendCbrQuotes', () => {
  it('requires an official-rate instrument and matching currency code', () => {
    expect(parseBackendCbrQuotes({
      usdrub_cbr: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 80.25,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
      eurrub_cbr: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 92.5,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
      usdrub: {
        ts: '2026-08-06T18:58:00.000Z',
        value: 81,
        meta: { source: 'cbr', cbrCode: 'USD' },
      },
    })).toEqual([{
      instrumentId: 'usdrub_cbr',
      value: 80.25,
      time: new Date('2026-08-06T18:58:00.000Z'),
      systime: new Date('2026-08-06T18:58:00.000Z'),
    }]);
  });
});
