import { RawQuote } from '../rates/quote.model';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Accept only server ticks whose provenance proves they came from Kraken. */
export function parseBackendKrakenQuotes(value: unknown): RawQuote[] {
  const root = record(value);
  if (!root) return [];
  const out: RawQuote[] = [];
  for (const [instrumentId, candidate] of Object.entries(root)) {
    const entry = record(candidate);
    const meta = record(entry?.['meta']);
    const timestamp = typeof entry?.['ts'] === 'string' ? Date.parse(entry['ts']) : NaN;
    const quoteValue = entry?.['value'];
    if (meta?.['source'] !== 'kraken') continue;
    if (typeof quoteValue !== 'number' || !Number.isFinite(quoteValue)) continue;
    if (!Number.isFinite(timestamp)) continue;
    const at = new Date(timestamp);
    out.push({ instrumentId, value: quoteValue, time: at, systime: at });
  }
  return out;
}
