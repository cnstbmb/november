export interface MusicTrack {
  readonly id: string;
  readonly assetUrl: string;
  readonly title: string;
  readonly composer: string;
  readonly performer: string;
  readonly sourceUrl: string;
  readonly license: string;
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
] as const;
