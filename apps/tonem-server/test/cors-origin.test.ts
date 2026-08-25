import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGINS, isAllowedOrigin } from '../src/cors-origin';

describe('TONEM CORS origin policy', () => {
  it('allows only the approved exact HTTPS origins', () => {
    expect(ALLOWED_ORIGINS).toEqual([
      'https://tonem.ru',
      'https://www.tonem.ru',
      'https://live.tonem.ru',
      'https://app.tonem.ru',
      'https://terminal.tonem.ru',
    ]);
    for (const origin of ALLOWED_ORIGINS) expect(isAllowedOrigin(origin)).toBe(true);
  });

  it('rejects wildcard lookalikes, insecure origins, and explicit null', () => {
    expect(isAllowedOrigin('https://evil.tonem.ru')).toBe(false);
    expect(isAllowedOrigin('https://app.tonem.ru.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://app.tonem.ru')).toBe(false);
    expect(isAllowedOrigin('null')).toBe(false);
  });

  it('allows non-browser clients without an Origin header', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });
});

