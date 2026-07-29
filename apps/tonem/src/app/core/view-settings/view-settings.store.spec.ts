import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalViewUrl,
  deserializeViewSettings,
  serializeViewSettings,
} from './view-settings.codec';
import {
  VIEW_SETTINGS_STORAGE_KEY,
  defaultViewSettings,
} from './view-settings.model';
import {
  VIEW_SETTINGS_PLATFORM,
  ViewSettingsPlatform,
} from './view-settings.platform';
import { ViewSettingsStore } from './view-settings.store';

class FakePlatform implements ViewSettingsPlatform {
  url = 'https://tonem.ru/market?from=test#campaign=night';
  readonly storage = new Map<string, string>();
  readonly writes: Array<{ key: string; value: string }> = [];
  copied: string | null = null;
  private listener: (() => void) | null = null;

  currentUrl(): string { return this.url; }
  replaceUrl(url: string): void { this.url = url; }
  readStorage(key: string): string | null { return this.storage.get(key) ?? null; }
  writeStorage(key: string, value: string): void {
    this.storage.set(key, value);
    this.writes.push({ key, value });
  }
  async copyText(value: string): Promise<void> { this.copied = value; }
  onHashChange(listener: () => void): () => void {
    this.listener = listener;
    return () => { this.listener = null; };
  }
  emitHashChange(): void { this.listener?.(); }
}

function createStore(platform: FakePlatform): ViewSettingsStore {
  TestBed.configureTestingModule({
    providers: [
      ViewSettingsStore,
      { provide: VIEW_SETTINGS_PLATFORM, useValue: platform },
    ],
  });
  return TestBed.inject(ViewSettingsStore);
}

afterEach(() => TestBed.resetTestingModule());

describe('ViewSettingsStore', () => {
  it('uses versioned local settings as the personal default', () => {
    const platform = new FakePlatform();
    const personal = {
      ...defaultViewSettings(),
      hero: { ...defaultViewSettings().hero, pinnedId: 'btc' },
    };
    platform.storage.set(VIEW_SETTINGS_STORAGE_KEY, serializeViewSettings(personal));

    const store = createStore(platform);

    expect(store.hero().pinnedId).toBe('btc');
    expect(store.imported()).toBe(false);
    expect(new URL(platform.url).hash).toContain('view=');
    expect(platform.writes).toHaveLength(0);
  });

  it('lets URL view override local settings without overwriting the personal copy', () => {
    const platform = new FakePlatform();
    const personal = {
      ...defaultViewSettings(),
      hero: { ...defaultViewSettings().hero, pinnedId: 'btc' },
    };
    const imported = {
      ...defaultViewSettings(),
      hero: { ...defaultViewSettings().hero, pinnedId: 'gold' },
      zen: { ...defaultViewSettings().zen, hideHero: true },
    };
    const stored = serializeViewSettings(personal);
    platform.storage.set(VIEW_SETTINGS_STORAGE_KEY, stored);
    platform.url = canonicalViewUrl(platform.url, imported);

    const store = createStore(platform);

    expect(store.hero().pinnedId).toBe('gold');
    expect(store.zen().hideHero).toBe(true);
    expect(store.imported()).toBe(true);
    expect(platform.storage.get(VIEW_SETTINGS_STORAGE_KEY)).toBe(stored);
    expect(platform.writes).toHaveLength(0);
  });

  it('persists only after explicit mutation and preserves unrelated hash params', () => {
    const platform = new FakePlatform();
    const imported = {
      ...defaultViewSettings(),
      hero: { ...defaultViewSettings().hero, pinnedId: 'gold' },
    };
    platform.url = canonicalViewUrl(platform.url, imported);
    const store = createStore(platform);

    store.setZen('hideLabels', true);

    const persisted = deserializeViewSettings(platform.storage.get(VIEW_SETTINGS_STORAGE_KEY) ?? null);
    expect(persisted?.hero.pinnedId).toBe('gold');
    expect(persisted?.zen.hideLabels).toBe(true);
    expect(store.imported()).toBe(false);
    expect(new URLSearchParams(new URL(platform.url).hash.slice(1)).get('campaign')).toBe('night');
    expect(platform.writes).toHaveLength(1);
  });

  it('restores personal settings when an imported hash is removed', () => {
    const platform = new FakePlatform();
    const personal = {
      ...defaultViewSettings(),
      hero: { ...defaultViewSettings().hero, pinnedId: 'btc' },
    };
    const imported = {
      ...defaultViewSettings(),
      hero: { ...defaultViewSettings().hero, pinnedId: 'gold' },
    };
    platform.storage.set(VIEW_SETTINGS_STORAGE_KEY, serializeViewSettings(personal));
    platform.url = canonicalViewUrl(platform.url, imported);
    const store = createStore(platform);

    platform.url = 'https://tonem.ru/market?from=test#campaign=night';
    platform.emitHashChange();

    expect(store.hero().pinnedId).toBe('btc');
    expect(store.imported()).toBe(false);
  });

  it('copies a canonical absolute URL with the complete view', async () => {
    const platform = new FakePlatform();
    const store = createStore(platform);
    store.setBackground('blur', 12);

    const shared = await store.share();

    expect(shared).toBe(platform.copied);
    expect(shared).toMatch(/^https:\/\/tonem\.ru\/market\?from=test#/);
    const params = new URLSearchParams(new URL(shared).hash.slice(1));
    expect(params.get('campaign')).toBe('night');
    expect(deserializeViewSettings(params.get('view'))?.background.blur).toBe(12);
  });

  it('rejects unknown schema versions instead of guessing', () => {
    expect(deserializeViewSettings(JSON.stringify({ v: 99 }))).toBeNull();
  });
});
