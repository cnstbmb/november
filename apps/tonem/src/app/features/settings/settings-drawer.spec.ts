import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmbientAudioEngine } from '../../core/audio/ambient-audio.engine';
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

describe('SettingsDrawerComponent', () => {
  let platform: DrawerPlatform;

  beforeEach(async () => {
    platform = new DrawerPlatform();
    await TestBed.configureTestingModule({
      imports: [SettingsDrawerComponent],
      providers: [
        ViewSettingsStore,
        {
          provide: AmbientAudioEngine,
          useValue: {
            status: signal('off'),
            enableFromGesture: vi.fn(),
            disable: vi.fn(),
            setVolume: vi.fn(),
          },
        },
        { provide: VIEW_SETTINGS_PLATFORM, useValue: platform },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders an accessible modal with all five ironic zen controls', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = element.querySelector('[role="dialog"]');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('settings-title');
    expect(element.textContent).toContain('убрать подписи — я и так всё понимаю');
    expect(element.textContent).toContain('убрать ленту — рынок слишком разговорчив');
    expect(element.textContent).toContain('убрать мелкие циферки — мелочность не красит');
    expect(element.textContent).toContain('убрать часы — время придумали биржи');
    expect(element.textContent).toContain('убрать эти дурацкие цифры — наконец-то');
    expect(element.querySelectorAll("input[type='range']").length).toBe(4);
    expect(element.textContent).toContain('включить биржевой эмбиент');
    expect(element.querySelector('fieldset[disabled]')).toBeNull();
  });

  it('emits close from the close button', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    await fixture.whenStable();
    let closes = 0;
    fixture.componentInstance.closed.subscribe(() => closes++);

    (fixture.nativeElement.querySelector('.close') as HTMLButtonElement).click();

    expect(closes).toBe(1);
  });

  it('calls the signal store when a zen control changes', async () => {
    const fixture = TestBed.createComponent(SettingsDrawerComponent);
    await fixture.whenStable();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>('label'),
    );
    const label = labels.find((candidate) => candidate.textContent?.includes('убрать подписи'));
    const checkbox = label?.querySelector<HTMLInputElement>('input');
    expect(checkbox).toBeTruthy();

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();

    expect(TestBed.inject(ViewSettingsStore).zen().hideLabels).toBe(true);
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
