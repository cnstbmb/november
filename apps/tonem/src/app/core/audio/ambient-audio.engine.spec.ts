import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoodEngine } from '../mood/mood.engine';
import { VIEW_SETTINGS_PLATFORM, ViewSettingsPlatform } from '../view-settings/view-settings.platform';
import { ViewSettingsStore } from '../view-settings/view-settings.store';
import { AmbientAudioEngine } from './ambient-audio.engine';
import { AMBIENT_AUDIO_PORT_FACTORY, AmbientAudioPort } from './ambient-audio.port';

class MemoryPlatform implements ViewSettingsPlatform {
  url = 'https://tonem.ru/';
  private readonly values = new Map<string, string>();
  currentUrl(): string { return this.url; }
  replaceUrl(url: string): void { this.url = url; }
  readStorage(key: string): string | null { return this.values.get(key) ?? null; }
  writeStorage(key: string, value: string): void { this.values.set(key, value); }
  async copyText(): Promise<void> {}
  onHashChange(): () => void { return () => undefined; }
}

function fakePort(): AmbientAudioPort & Record<string, ReturnType<typeof vi.fn>> {
  return {
    applyScene: vi.fn(),
    playNote: vi.fn(),
    setVolume: vi.fn(),
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

describe('AmbientAudioEngine', () => {
  const mood = signal({ hue: 0, energy: 0, turbulence: 0 });
  let port: ReturnType<typeof fakePort>;
  let factory: ReturnType<typeof vi.fn>;
  let settings: ViewSettingsStore;
  let engine: AmbientAudioEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    mood.set({ hue: 0, energy: 0, turbulence: 0 });
    port = fakePort();
    factory = vi.fn(() => port);
    TestBed.configureTestingModule({
      providers: [
        AmbientAudioEngine,
        ViewSettingsStore,
        { provide: MoodEngine, useValue: { mood: mood.asReadonly() } },
        { provide: VIEW_SETTINGS_PLATFORM, useValue: new MemoryPlatform() },
        { provide: AMBIENT_AUDIO_PORT_FACTORY, useValue: factory },
      ],
    });
    settings = TestBed.inject(ViewSettingsStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.useRealTimers();
  });

  it('restored sound intent is armed without constructing AudioContext', async () => {
    settings.setSound('enabled', true);
    const setSound = vi.spyOn(settings, 'setSound');
    engine = TestBed.inject(AmbientAudioEngine);

    expect(engine.status()).toBe('armed');
    expect(factory).not.toHaveBeenCalled();

    await engine.enableFromGesture();
    expect(setSound).not.toHaveBeenCalled();
  });

  it('creates and starts the graph only from the explicit gesture', async () => {
    engine = TestBed.inject(AmbientAudioEngine);
    expect(factory).not.toHaveBeenCalled();

    await engine.enableFromGesture();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(port.resume).toHaveBeenCalledTimes(1);
    expect(port.applyScene).toHaveBeenCalled();
    expect(port.setVolume).toHaveBeenCalledWith(expect.any(Number), 0.35);
    expect(engine.status()).toBe('playing');
  });

  it('turns port-construction failures into an error state', async () => {
    factory.mockImplementation(() => { throw new DOMException('device busy'); });
    engine = TestBed.inject(AmbientAudioEngine);

    await expect(engine.enableFromGesture()).resolves.toBeUndefined();
    expect(engine.status()).toBe('error');
  });

  it('fades, suspends, and stops note scheduling while the tab is hidden', async () => {
    engine = TestBed.inject(AmbientAudioEngine);
    await engine.enableFromGesture();

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.status()).toBe('hidden');
    expect(port.setVolume).toHaveBeenLastCalledWith(0, 0.08);

    await vi.advanceTimersByTimeAsync(100);
    expect(port.suspend).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale hide operation suspend audio after the tab is visible', async () => {
    engine = TestBed.inject(AmbientAudioEngine);
    await engine.enableFromGesture();

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);

    expect(port.suspend).not.toHaveBeenCalled();
    expect(engine.status()).toBe('playing');
  });
});
