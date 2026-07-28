/** Форматирование чисел и времени под русскую локаль */

export function formatValue(value: number | null, decimals: number): string {
  if (value === null) return '—';
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const timeFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(date: Date | null): string {
  return date ? timeFmt.format(date) : '';
}
