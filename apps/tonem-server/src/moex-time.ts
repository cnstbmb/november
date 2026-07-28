/**
 * MOEX time is Moscow time (UTC+3 year-round, no DST).
 * Ported from apps/tonem/src/app/core/moex/moex-time.ts.
 */

const mskParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Parses "2026-07-28 19:15:00" as Moscow time. */
export function parseMoexDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.replace(' ', 'T') + '+03:00';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * Glues TIME ("18:41:09") onto the Moscow date from a reference moment
 * (usually SYSTIME of the same record).
 */
export function moexTimeOnDate(
  time: string | null | undefined,
  dateSource: Date | null,
): Date | null {
  if (!time || !dateSource) return null;
  const ymd = mskParts.format(dateSource); // "2026-07-28"
  const ms = Date.parse(`${ymd}T${time}+03:00`);
  return Number.isNaN(ms) ? null : new Date(ms);
}
