import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { instrumentById } from '../instruments/instrument.registry';
import {
  canonicalViewUrl,
  deserializeViewSettings,
  normalizeViewSettings,
  serializeViewSettings,
  viewSettingsFromUrl,
} from './view-settings.codec';
import {
  BackgroundViewSettings,
  HeroMode,
  SoundViewSettings,
  VIEW_SETTINGS_STORAGE_KEY,
  ViewSettings,
  ZenSettingKey,
  defaultViewSettings,
} from './view-settings.model';
import { VIEW_SETTINGS_PLATFORM } from './view-settings.platform';

@Injectable({ providedIn: 'root' })
export class ViewSettingsStore {
  private readonly platform = inject(VIEW_SETTINGS_PLATFORM);
  private personalSettings =
    deserializeViewSettings(this.platform.readStorage(VIEW_SETTINGS_STORAGE_KEY)) ??
    defaultViewSettings();
  private readonly initialImport = viewSettingsFromUrl(this.platform.currentUrl());
  private readonly settingsSignal = signal<ViewSettings>(
    this.initialImport ?? this.personalSettings,
  );
  private readonly importedSignal = signal(this.initialImport !== null);

  readonly settings = this.settingsSignal.asReadonly();
  readonly imported = this.importedSignal.asReadonly();
  readonly hero = computed(() => this.settingsSignal().hero);
  readonly instruments = computed(() => this.settingsSignal().instruments);
  readonly zen = computed(() => this.settingsSignal().zen);
  readonly background = computed(() => this.settingsSignal().background);
  readonly sound = computed(() => this.settingsSignal().sound);

  constructor() {
    // A replaceState is deliberately not a personal-settings write: imported links stay ephemeral.
    this.replaceUrl(this.settingsSignal());
    const removeListener = this.platform.onHashChange(() => this.importHash());
    inject(DestroyRef).onDestroy(removeListener);
  }

  setHeroMode(mode: HeroMode): void {
    this.update((settings) => ({
      ...settings,
      hero: { ...settings.hero, mode },
    }));
  }

  setPinnedInstrument(id: string): void {
    if (!instrumentById(id)) return;
    this.update((settings) => ({
      ...settings,
      hero: { ...settings.hero, pinnedId: id },
    }));
  }

  pinInstrument(id: string): void {
    if (!instrumentById(id)) return;
    this.update((settings) => ({
      ...settings,
      hero: { ...settings.hero, mode: 'pinned', pinnedId: id },
    }));
  }

  setFavorite(id: string, favorite: boolean): void {
    if (!instrumentById(id)) return;
    this.update((settings) => {
      const without = settings.hero.favorites.filter((candidate) => candidate !== id);
      return {
        ...settings,
        hero: {
          ...settings.hero,
          favorites: favorite ? [...without, id] : without,
        },
      };
    });
  }

  setInstrumentHidden(id: string, hidden: boolean): void {
    if (!instrumentById(id)) return;
    this.update((settings) => {
      const without = settings.instruments.hidden.filter((candidate) => candidate !== id);
      return {
        ...settings,
        instruments: {
          ...settings.instruments,
          hidden: hidden ? [...without, id] : without,
        },
      };
    });
  }

  setInstrumentOrder(order: readonly string[]): void {
    this.update((settings) => ({
      ...settings,
      instruments: { ...settings.instruments, order: [...order] },
    }));
  }

  moveInstrument(id: string, direction: -1 | 1): void {
    const order = [...this.settingsSignal().instruments.order];
    const from = order.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.setInstrumentOrder(order);
  }

  setZen(key: ZenSettingKey, enabled: boolean): void {
    this.update((settings) => ({
      ...settings,
      zen: { ...settings.zen, [key]: enabled },
    }));
  }

  setBackground<K extends keyof BackgroundViewSettings>(
    key: K,
    value: BackgroundViewSettings[K],
  ): void {
    this.update((settings) => ({
      ...settings,
      background: { ...settings.background, [key]: value },
    }));
  }

  setSound<K extends keyof SoundViewSettings>(key: K, value: SoundViewSettings[K]): void {
    this.update((settings) => ({
      ...settings,
      sound: { ...settings.sound, [key]: value },
    }));
  }

  reset(): void {
    this.commit(defaultViewSettings());
  }

  /** Explicit mutations promote an imported view to the user's new personal settings. */
  update(mutator: (settings: ViewSettings) => ViewSettings): void {
    this.commit(mutator(this.settingsSignal()));
  }

  /** Copies a canonical absolute URL, including unrelated hash parameters. */
  async share(): Promise<string> {
    const url = canonicalViewUrl(this.platform.currentUrl(), this.settingsSignal());
    this.platform.replaceUrl(url);
    await this.platform.copyText(url);
    return url;
  }

  private commit(candidate: ViewSettings): void {
    const next = normalizeViewSettings(candidate);
    this.settingsSignal.set(next);
    this.personalSettings = next;
    this.importedSignal.set(false);
    this.platform.writeStorage(VIEW_SETTINGS_STORAGE_KEY, serializeViewSettings(next));
    this.replaceUrl(next);
  }

  private importHash(): void {
    const imported = viewSettingsFromUrl(this.platform.currentUrl());
    if (imported) {
      this.settingsSignal.set(imported);
      this.importedSignal.set(true);
      return;
    }
    this.settingsSignal.set(this.personalSettings);
    this.importedSignal.set(false);
  }

  private replaceUrl(settings: ViewSettings): void {
    this.platform.replaceUrl(canonicalViewUrl(this.platform.currentUrl(), settings));
  }
}
