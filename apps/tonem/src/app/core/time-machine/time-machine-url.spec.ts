import { describe, expect, it } from 'vitest';
import { canonicalTimeUrl, hasTimeTargetParam, timeTargetFromUrl } from './time-machine-url';

describe('time machine URL codec', () => {
  const target = new Date('2026-07-28T09:45:00.000Z');

  it('reads a valid ts from the hash', () => {
    expect(timeTargetFromUrl(`https://tonem.ru/#ts=${encodeURIComponent(target.toISOString())}`)?.toISOString())
      .toBe(target.toISOString());
  });

  it('rejects invalid and future timestamps while still detecting the URL parameter', () => {
    expect(timeTargetFromUrl('https://tonem.ru/#ts=not-a-date')).toBeNull();
    expect(timeTargetFromUrl('not a url')).toBeNull();
    expect(timeTargetFromUrl(
      'https://tonem.ru/#ts=2099-01-01T00%3A00%3A00.000Z',
      new Date('2026-07-30T00:00:00.000Z'),
    )).toBeNull();
    expect(hasTimeTargetParam('https://tonem.ru/#view=kept&ts=not-a-date')).toBe(true);
  });

  it('adds and removes ts without changing view or unrelated hash params', () => {
    const source = 'https://tonem.ru/#view=%7B%22v%22%3A1%7D&mode=quiet';
    const withTime = canonicalTimeUrl(source, target);
    const params = new URLSearchParams(new URL(withTime).hash.slice(1));

    expect(params.get('view')).toBe('{"v":1}');
    expect(params.get('mode')).toBe('quiet');
    expect(params.get('ts')).toBe(target.toISOString());

    const withoutTime = canonicalTimeUrl(withTime, null);
    const restored = new URLSearchParams(new URL(withoutTime).hash.slice(1));
    expect(restored.get('view')).toBe('{"v":1}');
    expect(restored.get('mode')).toBe('quiet');
    expect(restored.has('ts')).toBe(false);
  });
});
