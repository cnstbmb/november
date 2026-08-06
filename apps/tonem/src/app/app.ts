import {
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MarketViewStore } from './core/market-view/market-view.store';
import { ConnectivityService } from './core/offline/connectivity.service';
import { RecordedMusicPlayer } from './core/music/recorded-music-player';

import { formatTime } from './core/rates/value.format';
import { TimeMachineService } from './core/time-machine/time-machine.service';
import { ViewSettingsStore } from './core/view-settings/view-settings.store';
import { AuroraComponent } from './shared/aurora/aurora';
import { OdometerComponent } from './shared/odometer/odometer';
import { SettingsDrawerComponent } from './features/settings/settings-drawer';
import { TimeScrubberComponent } from './shared/time-scrubber/time-scrubber';

@Component({
  selector: 'app-root',
  imports: [
    OdometerComponent,
    AuroraComponent,
    SettingsDrawerComponent,
    TimeScrubberComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly marketView = inject(MarketViewStore);
  protected readonly viewSettings = inject(ViewSettingsStore);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly timeMachine = inject(TimeMachineService);
  protected readonly musicPlayer = inject(RecordedMusicPlayer);

  protected readonly settingsOpen = signal(false);
  protected readonly marqueePaused = signal(false);

  protected readonly zenMode = computed(() =>
    this.viewSettings.zen().hideTicker && this.viewSettings.zen().hideLabels,
  );

  protected readonly musicPlaying = computed(() =>
    this.musicPlayer.status() === 'playing',
  );

  constructor() {
    effect(() => {
      void this.timeMachine.active();
    });

    // Preload the audio track eagerly so it's ready when user enables music.
    afterNextRender(() => {
      this.musicPlayer.preload();
    });
  }

  protected readonly heroStatus = computed<string>(() => {
    const quote = this.marketView.hero()?.quote;
    if (this.timeMachine.active()) {
      if (this.timeMachine.error()) return 'машина времени недоступна';
      if (this.timeMachine.loading()) return 'загрузка истории…';
      const target = this.timeMachine.target();
      const timeLabel = target ? (formatTime(target) ?? target.toISOString()) : '';
      if (!quote || quote.value === null) {
        return timeLabel ? `прошлое · данных нет на ${timeLabel}` : 'прошлое · данных нет';
      }
      return timeLabel ? `прошлое · ${timeLabel}` : 'прошлое';
    }
    if (!this.connectivity.online()) {
      if (!quote || quote.value === null) return 'офлайн · сохранённых данных нет';
      if (this.viewSettings.zen().hideClock) return 'офлайн · последние данные';
      const time = formatTime(quote.time ?? quote.systime);
      return time ? `офлайн · последние данные в ${time}` : 'офлайн · последние данные';
    }
    if (!quote) return '';
    switch (quote.status) {
      case 'closed': {
        if (this.viewSettings.zen().hideClock) return 'торги закрыты';
        const time = formatTime(quote.time);
        return time ? `торги закрыты · последняя цена в ${time}` : 'торги закрыты';
      }
      case 'stale':
        return 'данные задерживаются…';
      case 'historical':
        return 'исторические данные';
      default:
        return '';
    }
  });

  protected isFavorite(id: string): boolean {
    return this.viewSettings.hero().favorites.includes(id);
  }

  protected toggleFavorite(id: string): void {
    this.viewSettings.setFavorite(id, !this.isFavorite(id));
  }

  protected readonly favoriteEntries = computed(() => {
    const favs = new Set(this.viewSettings.hero().favorites);
    return this.marketView
      .ticker()
      .filter((e) => favs.has(e.instrument.id) && e.quote.value !== null);
  });

  protected toggleZen(): void {
    const store = this.viewSettings;
    const isZen = this.zenMode();
    // Toggle all zen switches at once
    store.setZen('hideLabels', !isZen);
    store.setZen('hideTicker', !isZen);
    store.setZen('hideSmallNumbers', !isZen);
    store.setZen('hideClock', !isZen);
    // In zen mode, hero rotates among favorites
    store.setHeroMode(isZen ? 'pinned' : 'rotation');
    // In zen mode, enable music if sound is on
    if (!isZen && store.sound().enabled) {
      void this.musicPlayer.enableFromGesture();
    }
  }

  protected toggleMusic(): void {
    if (this.musicPlayer.status() === 'playing' || this.musicPlayer.status() === 'loading') {
      this.musicPlayer.disable();
    } else if (this.viewSettings.sound().enabled) {
      void this.musicPlayer.enableFromGesture();
    } else {
      this.viewSettings.setSound('enabled', true);
      void this.musicPlayer.enableFromGesture();
    }
  }

  protected openSettings(): void {
    this.settingsOpen.set(true);
  }

  protected closeSettings(): void {
    this.settingsOpen.set(false);
  }
}
