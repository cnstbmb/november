import { RawQuote } from '../rates/quote.model';

interface CbrValute {
  Nominal: number;
  Value: number;
}

interface CbrDaily {
  Date: string;
  Timestamp: string;
  Valute: Record<string, CbrValute>;
}

/** daily_json ЦБ: Value за Nominal единиц — нормализуем к 1 */
export function parseCbrDaily(
  json: unknown,
  mapping: readonly { id: string; cbrCode: string }[],
): RawQuote[] {
  const daily = json as CbrDaily;
  const time = new Date(daily.Date);
  const systime = new Date(daily.Timestamp);

  return mapping.map(({ id, cbrCode }) => {
    const v = daily.Valute?.[cbrCode];
    const value = v && v.Nominal > 0 ? v.Value / v.Nominal : null;
    return { instrumentId: id, value, time, systime };
  });
}
