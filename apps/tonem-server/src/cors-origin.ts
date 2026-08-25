export const ALLOWED_ORIGINS = Object.freeze([
  'https://tonem.ru',
  'https://www.tonem.ru',
  'https://live.tonem.ru',
  'https://app.tonem.ru',
  'https://terminal.tonem.ru',
]);

export function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === undefined || ALLOWED_ORIGINS.includes(origin);
}

