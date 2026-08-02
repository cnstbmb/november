import { describe, expect, it } from 'vitest';
import { MUSIC_LIBRARY } from './music-library';

describe('MUSIC_LIBRARY', () => {
  it('contains at least one recording', () => {
    expect(MUSIC_LIBRARY.length).toBeGreaterThanOrEqual(1);
  });

  it('has unique ids for all tracks', () => {
    const ids = MUSIC_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique asset URLs for all tracks', () => {
    const urls = MUSIC_LIBRARY.map((t) => t.assetUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('every track has required metadata fields', () => {
    for (const track of MUSIC_LIBRARY) {
      expect(track.id).toBeTruthy();
      expect(track.assetUrl).toMatch(/^audio\/tracks\//);
      expect(track.title).toBeTruthy();
      expect(track.composer).toBeTruthy();
      expect(track.performer).toBeTruthy();
      expect(track.sourceUrl).toMatch(/^https?:\/\//);
      expect(track.license).toBeTruthy();
      expect(track.format).toMatch(/^(mp3|ogg)$/);
    }
  });

  it('every track references CC0 or Public Domain', () => {
    for (const track of MUSIC_LIBRARY) {
      expect(track.license.toLowerCase()).toMatch(/cc0|public domain/);
    }
  });
});
