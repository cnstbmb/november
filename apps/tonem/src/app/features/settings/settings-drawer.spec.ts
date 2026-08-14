import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATE_AUDIO, RecordedMusicPlayer } from '../../core/music/recorded-music-player';
import { VIEW_SETTINGS_PLATFORM, ViewSettingsPlatform } from '../../core/view-settings/view-settings.platform';
import { ViewSettingsStore } from '../../core/view-settings/view-settings.store';
import { SettingsDrawerComponent } from './settings-drawer';

class DrawerPlatform implements ViewSettingsPlatform {
  url = 'https://tonem.ru/#campaign=test';
  copied: string | null = null;
  readonly storage = new Map<string, string>();
  currentUrl(): string { return this.url; }
  replaceUrl(url: string): void { this.url = url; }
  readStorage(key: string): string | null { return this.storage.get(key) ?? null; }
  writeStorage(key: string, value: string): void { this.storage.set(key, value); }
  async copyText(value: string): Promise<void> { this.copied = value; }
  onHashChange(): () => void { return () => undefined; }
}

function fakeAudio(): HTMLAudioElement {
  return {
    play: () => Promise.resolve(),
    pause: () => undefined,
    load: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    removeAttribute: () => undefined,
    get volume() { return 1; },
    set volume(_v: number) {},
    get currentTime() { return 0; },
    set currentTime(_v: number) {},
    get paused() { return false; },
    get src() { return ''; },
    set src(_v: string) {},
  } as unknown as HTMLAudioElement;
}

describe('SettingsDrawerComponent', () => {
  let platform: DrawerPlatform;

  beforeEach(async () => {
    platform = new DrawerPlatform();
    await TestBed.configureTestingModule({
      imports: [SettingsDrawerComponent],
      providers: [
        ViewSettingsStore,
        { provide: CREATE_AUDIO, useValue: () => fakeAudio() },
        RecordedMusicPlayer,
        { provide: VIEW_SETTINGS_PLATFORM, useValue: platform },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders an accessible modal with sound, background, and instrument controls', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = element.querySelector('[role="dialog"]');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('settings-title');
    expect(element.textContent).toContain('включить спокойную музыку');
    expect(element.textContent).toContain('рынок задаёт настроение');
    expect(element.querySelectorAll("input[type='range']").length).toBe(4);
    expect(element.querySelector('fieldset[disabled]')).toBeNull();
    expect(element.textContent).toContain('Без cookies и межсессионного профиля');
    expect(element.textContent).toContain('Сырые события удаляются через 90 дней');
  });

  it('emits close from the close button', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    await fixture.whenStable();
    let closes = 0;
    fixture.componentInstance.closed.subscribe(() => closes++);

    (fixture.nativeElement.querySelector('.close') as HTMLButtonElement).click();

    expect(closes).toBe(1);
  });

  it('calls the signal store when sound toggle changes', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    const store = TestBed.inject(ViewSettingsStore);
    await fixture.whenStable();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>('label'),
    );
    const label = labels.find((candidate) => candidate.textContent?.includes('включить спокойную музыку'));
    const checkbox = label?.querySelector<HTMLInputElement>('input');
    expect(checkbox).toBeTruthy();

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();

    // Sound toggle also fires enableFromGesture which is mocked;
    // verify the store API was called via the component handler.
    expect(store.sound().enabled).toBe(true);
  });

  it('copies a canonical full URL from the share action', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    await fixture.whenStable();

    (fixture.nativeElement.querySelector('.share') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(platform.copied).toBe(platform.url);
    expect(platform.copied).toMatch(/^https:\/\/tonem\.ru\/#/);
    expect(new URLSearchParams(new URL(platform.copied!).hash.slice(1)).get('campaign')).toBe('test');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ссылка скопирована');
  });
});
