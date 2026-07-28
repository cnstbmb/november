/**
 * Время MOEX — московское (UTC+3 круглый год, без DST).
 * Поля приходят строками: SYSTIME "2026-07-28 19:15:00", TIME "18:41:09".
 */

const mskParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Парсит "2026-07-28 19:15:00" как московское время */
export function parseMoexDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.replace(' ', 'T') + '+03:00';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * Приклеивает TIME ("18:41:09") к московской дате из опорного момента
 * (обычно SYSTIME той же записи — время сделки и фида в одной сессии).
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
