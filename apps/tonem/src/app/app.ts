import { Component, computed, effect, inject, signal } from '@angular/core';
import { Instrument } from './core/instruments/instrument.model';
import { MarketViewStore } from './core/market-view/market-view.store';
import { ConnectivityService } from './core/offline/connectivity.service';

import { TickerEntry } from './core/rates/rates.store';
import { formatTime } from './core/rates/value.format';
import { TimeMachineService } from './core/time-machine/time-machine.service';
import { ViewSettingsStore } from './core/view-settings/view-settings.store';
import { SettingsDrawerComponent } from './features/settings/settings-drawer';
import { AuroraComponent } from './shared/aurora/aurora';
import { OdometerComponent } from './shared/odometer/odometer';
import { MusicInfoComponent } from './shared/music-info/music-info';
import { RecordedMusicPlayer } from './core/music/recorded-music-player';
import { SoundControlComponent } from './shared/sound-control/sound-control';
import { SparklineComponent } from './shared/sparkline/sparkline';
import { TimeScrubberComponent } from './shared/time-scrubber/time-scrubber';

@Component({
  selector: 'app-root',
  imports: [
    OdometerComponent,
    AuroraComponent,
    SparklineComponent,
    SettingsDrawerComponent,
    SoundControlComponent,
    MusicInfoComponent,
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

  protected readonly sparkInstrument = signal<Instrument | null>(null);
  protected readonly settingsOpen = signal(false);
  protected readonly musicInfoOpen = signal(false);
  protected readonly canOpenHeroSparkline = computed(
    () => !this.timeMachine.active() && this.marketView.canOpenHeroSparkline(),
  );

  constructor() {
    effect(() => {
      if (this.timeMachine.active()) this.sparkInstrument.set(null);
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
    if (quote.source === 'cbr') return 'курс ЦБ РФ';
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

  protected isDim(entry: TickerEntry): boolean {
    return entry.quote.status === 'closed' || entry.quote.status === 'unavailable';
  }

  protected openSpark(): void {
    if (!this.canOpenHeroSparkline()) return;
    const instrument = this.marketView.hero()?.instrument;
    if (instrument) this.sparkInstrument.set(instrument);
  }

  protected closeSpark(): void {
    this.sparkInstrument.set(null);
  }

  protected openSettings(): void {
    this.settingsOpen.set(true);
  }

  protected closeSettings(): void {
    this.settingsOpen.set(false);
    queueMicrotask(() => document.querySelector<HTMLElement>('.settings-trigger')?.focus());
  }
}
