import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { MoodEngine } from '../mood/mood.engine';
import { ViewSettingsStore } from '../view-settings/view-settings.store';
import { AMBIENT_AUDIO_PORT_FACTORY, AmbientAudioPort } from './ambient-audio.port';
import {
  AmbientScene,
  moodToAmbientScene,
  nextAmbientDelay,
  nextAmbientFrequency,
  volumeToGain,
} from './ambient.model';

export type AmbientAudioStatus =
  | 'off'
  | 'armed'
  | 'starting'
  | 'playing'
  | 'hidden'
  | 'blocked'
  | 'unsupported'
  | 'error';

@Injectable({ providedIn: 'root' })
export class AmbientAudioEngine {
  private readonly mood = inject(MoodEngine);
  private readonly settings = inject(ViewSettingsStore);
  private readonly createPort = inject(AMBIENT_AUDIO_PORT_FACTORY);
  private readonly statusSignal = signal<AmbientAudioStatus>('off');
  private port: AmbientAudioPort | null = null;
  private scene: AmbientScene = moodToAmbientScene(this.mood.mood());
  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private unlocked = false;
  private destroyed = false;
  private lifecycleGeneration = 0;

  readonly status = this.statusSignal.asReadonly();

  constructor() {
    if (this.settings.sound().enabled) this.statusSignal.set('armed');

    effect(() => {
      this.scene = moodToAmbientScene(this.mood.mood());
      this.port?.applyScene(this.scene, 1.4);
    });

    effect(() => {
      const sound = this.settings.sound();
      if (!sound.enabled) {
        void this.stop();
        return;
      }
      if (!this.port) {
        this.statusSignal.set('armed');
        return;
      }
      this.port.setVolume(volumeToGain(sound.volume), 0.35);
    });

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  /** Must be called synchronously from a trusted click/key event. */
  async enableFromGesture(): Promise<void> {
    // An imported sound-on view is already enabled: unlocking it must not promote
    // the foreign view to the user's personal localStorage settings.
    if (!this.settings.sound().enabled) this.settings.setSound('enabled', true);
    const generation = ++this.lifecycleGeneration;

    this.statusSignal.set('starting');
    try {
      if (!this.port) {
        this.port = this.createPort();
        if (!this.port) {
          this.statusSignal.set('unsupported');
          return;
        }
      }
      const port = this.port;
      await port.resume();
      if (
        this.destroyed ||
        generation !== this.lifecycleGeneration ||
        port !== this.port ||
        !this.settings.sound().enabled
      ) return;
      if (document.hidden) {
        this.statusSignal.set('hidden');
        await port.suspend();
        return;
      }
      this.unlocked = true;
      port.applyScene(this.scene, 0.8);
      port.setVolume(volumeToGain(this.settings.sound().volume), 0.35);
      this.statusSignal.set('playing');
      this.scheduleNote();
    } catch (error) {
      if (generation === this.lifecycleGeneration) {
        this.statusSignal.set(isAutoplayError(error) ? 'blocked' : 'error');
      }
    }
  }

  disable(): void {
    this.settings.setSound('enabled', false);
  }

  setVolume(volume: number): void {
    this.settings.setSound('volume', volume);
  }

  private scheduleNote(): void {
    this.clearNoteTimer();
    if (!this.port || this.statusSignal() !== 'playing') return;
    this.noteTimer = setTimeout(() => {
      if (!this.port || this.statusSignal() !== 'playing') return;
      this.port.playNote(nextAmbientFrequency(this.scene), this.scene.noteGain);
      this.scheduleNote();
    }, nextAmbientDelay(this.scene));
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      void this.muteForBackground();
    } else {
      void this.resumeFromBackground();
    }
  };

  private readonly onPageHide = (): void => {
    void this.muteForBackground();
  };

  private readonly onPageShow = (): void => {
    if (!document.hidden) void this.resumeFromBackground();
  };

  private async muteForBackground(): Promise<void> {
    if (!this.port || !this.settings.sound().enabled) return;
    const port = this.port;
    const generation = ++this.lifecycleGeneration;
    this.clearNoteTimer();
    port.setVolume(0, 0.08);
    this.statusSignal.set('hidden');
    await delay(100);
    if (generation !== this.lifecycleGeneration || port !== this.port || !document.hidden) return;
    try {
      await port.suspend();
    } catch {
      // The gain is already zero; a failed suspend does not leak audible sound.
    }
  }

  private async resumeFromBackground(): Promise<void> {
    if (!this.port || !this.unlocked || !this.settings.sound().enabled) return;
    const port = this.port;
    const generation = ++this.lifecycleGeneration;
    try {
      await port.resume();
      if (
        generation !== this.lifecycleGeneration ||
        port !== this.port ||
        document.hidden ||
        !this.settings.sound().enabled
      ) return;
      port.applyScene(this.scene, 0.5);
      port.setVolume(volumeToGain(this.settings.sound().volume), 0.35);
      this.statusSignal.set('playing');
      this.scheduleNote();
    } catch {
      if (generation === this.lifecycleGeneration) this.statusSignal.set('blocked');
    }
  }

  private async stop(): Promise<void> {
    ++this.lifecycleGeneration;
    this.clearNoteTimer();
    const port = this.port;
    this.port = null;
    this.unlocked = false;
    this.statusSignal.set('off');
    if (!port) return;
    port.setVolume(0, 0.08);
    await delay(100);
    try {
      await port.close();
    } catch {
      // Closing is best-effort during navigation/device changes.
    }
  }

  private clearNoteTimer(): void {
    if (this.noteTimer !== null) {
      clearTimeout(this.noteTimer);
      this.noteTimer = null;
    }
  }

  private destroy(): void {
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    void this.stop();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAutoplayError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}
