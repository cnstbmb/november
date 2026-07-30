/**
 * Machine-readable catalog of all locally bundled CC0/PD music tracks.
 * Each entry mirrors the verified metadata in public/audio/LICENSES.md.
 * The first entry is the default track played on start.
 */

export interface MusicTrack {
  /** Stable identifier used as array key — never changes across releases. */
  readonly id: string;
  /** Local asset URL relative to the app root (public/). */
  readonly assetUrl: string;
  readonly title: string;
  readonly composer: string;
  readonly performer: string;
  /** Canonical source page with license declaration. */
  readonly sourceUrl: string;
  /** Exact license identifier. */
  readonly license: string;
  /** File format extension. */
  readonly format: string;
}

export const MUSIC_LIBRARY: readonly MusicTrack[] = [
  {
    id: 'november-snow',
    assetUrl: 'audio/tracks/10-november-snow.mp3',
    title: 'November Snow',
    composer: 'cynicmusic (Steven Ruud)',
    performer: 'cynicmusic (Steven Ruud)',
    sourceUrl: 'https://opengameart.org/content/november-snow',
    license: 'CC0 1.0 Universal',
    format: 'mp3',
  },
  {
    id: 'first-light-particles',
    assetUrl: 'audio/tracks/01-first-light-particles.mp3',
    title: 'First Light Particles',
    composer: 'Yoiyami',
    performer: 'Yoiyami',
    sourceUrl:
      'https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track',
    license: 'CC0 1.0 Universal',
    format: 'mp3',
  },
  {
    id: 'yoiyami-core-theme',
    assetUrl: 'audio/tracks/02-yoiyami-core-theme.mp3',
    title: 'Yoiyami Core Theme — Deep Blue Ambient Piano',
    composer: 'Yoiyami',
    performer: 'Yoiyami',
    sourceUrl:
      'https://opengameart.org/content/yoiyami-core-theme-%E2%80%93-deep-blue-ambient-piano',
    license: 'CC0 1.0 Universal',
    format: 'mp3',
  },
  {
    id: 'budding-consciousness',
    assetUrl: 'audio/tracks/03-budding-consciousness.mp3',
    title: 'The Budding of Consciousness',
    composer: 'Yoiyami',
    performer: 'Yoiyami',
    sourceUrl:
      'https://opengameart.org/content/the-budding-of-consciousness-%E2%80%93-cc0-ambient-minimalist-theme-yoiyami-blue-series-%E2%80%93-no4',
    license: 'CC0 1.0 Universal',
    format: 'mp3',
  },
  {
    id: 'bluebonnet',
    assetUrl: 'audio/tracks/04-bluebonnet.ogg',
    title: 'Bluebonnet',
    composer: 'Kistol',
    performer: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/bluebonnet',
    license: 'CC0 1.0 Universal',
    format: 'ogg',
  },
  {
    id: 'daisy',
    assetUrl: 'audio/tracks/05-daisy.ogg',
    title: 'Daisy',
    composer: 'Kistol',
    performer: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/daisy',
    license: 'CC0 1.0 Universal',
    format: 'ogg',
  },
  {
    id: 'catmint',
    assetUrl: 'audio/tracks/06-catmint.ogg',
    title: 'Catmint',
    composer: 'Kistol',
    performer: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/catmint',
    license: 'CC0 1.0 Universal',
    format: 'ogg',
  },
  {
    id: 'forget-me-not',
    assetUrl: 'audio/tracks/07-forget-me-not.ogg',
    title: 'Forget Me Not',
    composer: 'Kistol',
    performer: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/forget-me-not',
    license: 'CC0 1.0 Universal',
    format: 'ogg',
  },
  {
    id: 'bedazzled',
    assetUrl: 'audio/tracks/08-bedazzled.ogg',
    title: 'Bedazzled',
    composer: 'Kistol',
    performer: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/bedazzled',
    license: 'CC0 1.0 Universal',
    format: 'ogg',
  },
  {
    id: 'waiting-ii',
    assetUrl: 'audio/tracks/09-waiting-ii.ogg',
    title: 'Waiting II',
    composer: 'Kistol',
    performer: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/waiting-ii',
    license: 'CC0 1.0 Universal',
    format: 'ogg',
  },
] as const;
