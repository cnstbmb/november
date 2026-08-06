import { INSTRUMENTS } from '../instruments/instrument.registry';
import {
  VIEW_SETTINGS_VERSION,
  ViewSettings,
  defaultViewSettings,
} from './view-settings.model';

type UnknownRecord = Readonly<Record<string, unknown>>;

interface ViewPayloadV1 {
  readonly v: 1;
  readonly h: { readonly m: 'pinned' | 'rotation'; readonly p: string; readonly f: readonly string[] };
  readonly i: { readonly o: readonly string[]; readonly x: readonly string[] };
  readonly z: { readonly a: boolean; readonly l: boolean; readonly t: boolean; readonly n: boolean; readonly c: boolean; readonly h: boolean };
  readonly b: { readonly d: number; readonly b: number; readonly s: number; readonly m: boolean };
  readonly s: { readonly e: boolean; readonly v: number };
}

const instrumentIds = INSTRUMENTS.map((instrument) => instrument.id);
const knownIds = new Set(instrumentIds);

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function knownId(value: unknown, fallback: string): string {
  return typeof value === 'string' && knownIds.has(value) ? value : fallback;
}

function knownIdList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const unique = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate === 'string' && knownIds.has(candidate)) unique.add(candidate);
  }
  return [...unique];
}

function completeOrder(value: unknown): string[] {
  const requested = knownIdList(value, []);
  const included = new Set(requested);
  return [...requested, ...instrumentIds.filter((id) => !included.has(id))];
}

/** Validates settings at every external boundary and fills fields added within v1. */
export function normalizeViewSettings(value: unknown): ViewSettings {
  const defaults = defaultViewSettings();
  const root = record(value);
  if (!root || root['version'] !== VIEW_SETTINGS_VERSION) return defaults;

  const hero = record(root['hero']);
  const instruments = record(root['instruments']);
  const zen = record(root['zen']);
  const background = record(root['background']);
  const sound = record(root['sound']);
  const order = completeOrder(instruments?.['order']);
  const hiddenSet = new Set(knownIdList(instruments?.['hidden'], defaults.instruments.hidden));
  const requestedFavorites = knownIdList(hero?.['favorites'], defaults.hero.favorites);
  const legacyZenActive =
    zen?.['hideTicker'] === true &&
    zen?.['hideSmallNumbers'] === true &&
    zen?.['hideClock'] === true;
  const zenActive = boolean(zen?.['active'], legacyZenActive);

  return {
    version: VIEW_SETTINGS_VERSION,
    hero: {
      mode: zenActive || hero?.['mode'] === 'rotation' ? 'rotation' : 'pinned',
      pinnedId: knownId(hero?.['pinnedId'], defaults.hero.pinnedId),
      favorites: requestedFavorites.length > 0
        ? requestedFavorites
        : [...defaults.hero.favorites],
    },
    instruments: {
      order,
      hidden: order.filter((id) => hiddenSet.has(id)),
    },
    zen: {
      active: zenActive,
      hideLabels: zenActive
        ? false
        : boolean(zen?.['hideLabels'], defaults.zen.hideLabels),
      hideTicker: zenActive
        ? true
        : boolean(zen?.['hideTicker'], defaults.zen.hideTicker),
      hideSmallNumbers: zenActive
        ? true
        : boolean(zen?.['hideSmallNumbers'], defaults.zen.hideSmallNumbers),
      hideClock: zenActive
        ? true
        : boolean(zen?.['hideClock'], defaults.zen.hideClock),
      hideHero: zenActive ? false : boolean(zen?.['hideHero'], defaults.zen.hideHero),
    },
    background: {
      dim: numberIn(background?.['dim'], defaults.background.dim, 0, 1),
      blur: numberIn(background?.['blur'], defaults.background.blur, 0, 40),
      speed: numberIn(background?.['speed'], defaults.background.speed, 0.1, 3),
      moodEnabled: boolean(background?.['moodEnabled'], defaults.background.moodEnabled),
    },
    sound: {
      enabled: boolean(sound?.['enabled'], defaults.sound.enabled),
      volume: numberIn(sound?.['volume'], defaults.sound.volume, 0, 1),
    },
  };
}

function toPayload(settings: ViewSettings): ViewPayloadV1 {
  const value = normalizeViewSettings(settings);
  return {
    v: 1,
    h: { m: value.hero.mode, p: value.hero.pinnedId, f: value.hero.favorites },
    i: { o: value.instruments.order, x: value.instruments.hidden },
    z: {
      a: value.zen.active,
      l: value.zen.hideLabels,
      t: value.zen.hideTicker,
      n: value.zen.hideSmallNumbers,
      c: value.zen.hideClock,
      h: value.zen.hideHero,
    },
    b: {
      d: value.background.dim,
      b: value.background.blur,
      s: value.background.speed,
      m: value.background.moodEnabled,
    },
    s: { e: value.sound.enabled, v: value.sound.volume },
  };
}

export function serializeViewSettings(settings: ViewSettings): string {
  return JSON.stringify(toPayload(settings));
}

export function deserializeViewSettings(serialized: string | null): ViewSettings | null {
  if (!serialized) return null;
  try {
    const payload = record(JSON.parse(serialized));
    if (!payload || payload['v'] !== VIEW_SETTINGS_VERSION) return null;
    const hero = record(payload['h']);
    const instruments = record(payload['i']);
    const zen = record(payload['z']);
    const background = record(payload['b']);
    const sound = record(payload['s']);

    return normalizeViewSettings({
      version: VIEW_SETTINGS_VERSION,
      hero: { mode: hero?.['m'], pinnedId: hero?.['p'], favorites: hero?.['f'] },
      instruments: { order: instruments?.['o'], hidden: instruments?.['x'] },
      zen: {
        active: zen?.['a'],
        hideLabels: zen?.['l'],
        hideTicker: zen?.['t'],
        hideSmallNumbers: zen?.['n'],
        hideClock: zen?.['c'],
        hideHero: zen?.['h'],
      },
      background: {
        dim: background?.['d'],
        blur: background?.['b'],
        speed: background?.['s'],
        moodEnabled: background?.['m'],
      },
      sound: { enabled: sound?.['e'], volume: sound?.['v'] },
    });
  } catch {
    return null;
  }
}

export function viewSettingsFromUrl(url: string): ViewSettings | null {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.hash.slice(1));
    return deserializeViewSettings(params.get('view'));
  } catch {
    return null;
  }
}

/** Returns a deterministic full URL while retaining unrelated hash parameters. */
export function canonicalViewUrl(url: string, settings: ViewSettings): string {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.slice(1));
  params.set('view', serializeViewSettings(settings));
  params.sort();
  parsed.hash = params.toString();
  return parsed.toString();
}
