import { HERO_INSTRUMENT_ID, INSTRUMENTS } from '../instruments/instrument.registry';

export const VIEW_SETTINGS_VERSION = 1 as const;
export const VIEW_SETTINGS_STORAGE_KEY = 'tonem.view-settings';

export type HeroMode = 'pinned' | 'rotation';

export interface HeroViewSettings {
  readonly mode: HeroMode;
  readonly pinnedId: string;
  readonly favorites: readonly string[];
}

export interface InstrumentViewSettings {
  readonly order: readonly string[];
  readonly hidden: readonly string[];
}

export interface ZenViewSettings {
  readonly hideLabels: boolean;
  readonly hideTicker: boolean;
  readonly hideSmallNumbers: boolean;
  readonly hideClock: boolean;
  readonly hideHero: boolean;
}

export type ZenSettingKey = keyof ZenViewSettings;

export interface BackgroundViewSettings {
  /** Затемнение поверх фона: 0 — как есть, 1 — полная темнота. */
  readonly dim: number;
  /** Размытие фона в CSS-пикселях. */
  readonly blur: number;
  /** Множитель скорости генеративного фона. */
  readonly speed: number;
  readonly moodEnabled: boolean;
}

/** Зарезервировано для T11: схема и URL уже не потребуют миграции. */
export interface SoundViewSettings {
  readonly enabled: boolean;
  readonly volume: number;
}

export interface ViewSettings {
  readonly version: typeof VIEW_SETTINGS_VERSION;
  readonly hero: HeroViewSettings;
  readonly instruments: InstrumentViewSettings;
  readonly zen: ZenViewSettings;
  readonly background: BackgroundViewSettings;
  readonly sound: SoundViewSettings;
}

export function defaultViewSettings(): ViewSettings {
  return {
    version: VIEW_SETTINGS_VERSION,
    hero: {
      mode: 'pinned',
      pinnedId: HERO_INSTRUMENT_ID,
      favorites: ['usdrub', 'eurrub', 'cnyrub', 'brent'],
    },
    instruments: {
      order: INSTRUMENTS.map((instrument) => instrument.id),
      hidden: [],
    },
    zen: {
      hideLabels: false,
      hideTicker: false,
      hideSmallNumbers: false,
      hideClock: false,
      hideHero: false,
    },
    background: {
      dim: 0,
      blur: 0,
      speed: 1,
      moodEnabled: true,
    },
    sound: {
      enabled: false,
      volume: 0.35,
    },
  };
}
