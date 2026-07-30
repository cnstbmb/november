import { DestroyRef, InjectionToken, Injectable, inject, signal } from '@angular/core';
import { ViewSettingsStore } from '../view-settings/view-settings.store';
import { MUSIC_LIBRARY, MusicTrack } from './music-library';

export type PlayerStatus =
  | 'off'
  | 'armed'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'hidden'
  | 'error';

export type PlaylistMode = 'sequential' | 'shuffle';

export type CreateAudioFn = (src: string) => HTMLAudioElement;

export const CREATE_AUDIO = new InjectionToken<CreateAudioFn>('CREATE_AUDIO', {
  factory: () => (src) => new Audio(src),
});

const defaultCreateAudio: CreateAudioFn = (src) => new Audio(src);

@Injectable({ providedIn: 'root' })
export class RecordedMusicPlayer {
  private readonly settings = inject(ViewSettingsStore);
  private readonly createAudio = inject(CREATE_AUDIO, { optional: true }) ?? defaultCreateAudio;
  private readonly statusSignal = signal<PlayerStatus>('off');
  private readonly currentIndexSignal = signal(0);

  readonly status = this.statusSignal.asReadonly();
  readonly currentIndex = this.currentIndexSignal.asReadonly();
  readonly currentTrack = (): MusicTrack | null => {
    const idx = this.currentIndexSignal();
    return idx >= 0 && idx < MUSIC_LIBRARY.length ? MUSIC_LIBRARY[idx] : null;
  };

  private readonly modeSignal = signal<PlaylistMode>('sequential');

  readonly mode = this.modeSignal.asReadonly();

  private audio: HTMLAudioElement | null = null;
  private shuffledIndices: number[] = [];
  private shufflePosition = 0;
  private unlocked = false;
  private destroyed = false;

  constructor() {
    if (this.settings.sound().enabled) this.statusSignal.set('armed');

    inject(DestroyRef).onDestroy(() => this.destroy());

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
  }

  /**
   * Must be called synchronously from a trusted user gesture (click/key).
   * Respects the browser autoplay policy: AudioContext/resume happens implicitly
   * when the first play() follows a user gesture.
   */
  enableFromGesture(): void {
    if (!this.settings.sound().enabled) {
      this.settings.setSound('enabled', true);
    }
    this.unlocked = true;
    this.playCurrent();
  }

  disable(): void {
    this.settings.setSound('enabled', false);
    this.stop();
  }

  setVolume(volume: number): void {
    this.settings.setSound('volume', volume);
    if (this.audio) this.audio.volume = clamp(volume, 0, 1);
  }

  next(): void {
    this.advance();
    this.playCurrent();
  }

  setMode(mode: PlaylistMode): void {
    this.modeSignal.set(mode);
    if (mode === 'shuffle') this.reshuffle();
  }

  toggleMode(): void {
    const next = this.modeSignal() === 'sequential' ? 'shuffle' : 'sequential';
    this.setMode(next);
  }

  // ----------- internal ----------

  private playCurrent(): void {
    if (!this.unlocked || !this.settings.sound().enabled) return;
    const track = this.currentTrack();
    if (!track) return;

    this.statusSignal.set('loading');
    this.stopAudio();

    const audio = this.createAudio(track.assetUrl);
    audio.volume = clamp(this.settings.sound().volume, 0, 1);
    audio.addEventListener('ended', () => this.onEnded());
    audio.addEventListener('error', () => this.onError());
    this.audio = audio;

    audio
      .play()
      .then(() => {
        if (this.audio !== audio || this.destroyed) return;
        this.statusSignal.set(document.hidden ? 'hidden' : 'playing');
      })
      .catch(() => {
        if (this.audio === audio) this.statusSignal.set('error');
      });
  }

  private stop(): void {
    this.stopAudio();
    this.audio = null;
    this.statusSignal.set('off');
  }

  private stopAudio(): void {
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.removeAttribute('src');
      this.audio.load();
    } catch {
      // Best-effort cleanup.
    }
  }

  private advance(): void {
    if (this.modeSignal() === 'shuffle') {
      this.shufflePosition++;
      if (this.shufflePosition >= this.shuffledIndices.length) this.reshuffle();
      this.currentIndexSignal.set(this.shuffledIndices[this.shufflePosition]);
    } else {
      this.currentIndexSignal.set(
        (this.currentIndexSignal() + 1) % MUSIC_LIBRARY.length,
      );
    }
  }

  private reshuffle(): void {
    this.shuffledIndices = fisherYatesShuffle(
      Array.from({ length: MUSIC_LIBRARY.length }, (_, i) => i),
    );
    this.shufflePosition = 0;
    this.currentIndexSignal.set(this.shuffledIndices[0]);
  }

  private onEnded(): void {
    this.advance();
    this.playCurrent();
  }

  private onError(): void {
    this.statusSignal.set('error');
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
    if (!this.audio || !this.unlocked || !this.settings.sound().enabled) return;
    this.audio.volume = 0;
    this.statusSignal.set('hidden');
  }

  private async resumeFromBackground(): Promise<void> {
    if (!this.audio || !this.unlocked || !this.settings.sound().enabled) return;
    if (this.statusSignal() !== 'playing' && this.statusSignal() !== 'hidden')
      return;
    this.audio.volume = clamp(this.settings.sound().volume, 0, 1);
    if (this.audio.paused) {
      try {
        await this.audio.play();
      } catch {
        this.statusSignal.set('error');
        return;
      }
    }
    this.statusSignal.set('playing');
  }

  private destroy(): void {
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    this.stop();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Fisher-Yates in-place shuffle returning the same array. */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
