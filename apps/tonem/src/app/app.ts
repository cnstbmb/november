import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BinanceWsService } from './core/binance/binance-ws.service';
import { Instrument } from './core/instruments/instrument.model';
import { MarketViewStore } from './core/market-view/market-view.store';
import { ConnectivityService } from './core/offline/connectivity.service';
import { RatesPoller } from './core/rates/rates-poller.service';
import { TickerEntry } from './core/rates/rates.store';
import { formatTime } from './core/rates/value.format';
import { ViewSettingsStore } from './core/view-settings/view-settings.store';
import { SettingsDrawerComponent } from './features/settings/settings-drawer';
import { AuroraComponent } from './shared/aurora/aurora';
import { OdometerComponent } from './shared/odometer/odometer';
import { SoundControlComponent } from './shared/sound-control/sound-control';
import { SparklineComponent } from './shared/sparkline/sparkline';

@Component({
  selector: 'app-root',
  imports: [
    OdometerComponent,
    AuroraComponent,
    SparklineComponent,
    SettingsDrawerComponent,
    SoundControlComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly poller = inject(RatesPoller);
  private readonly binance = inject(BinanceWsService);
  protected readonly marketView = inject(MarketViewStore);
  protected readonly viewSettings = inject(ViewSettingsStore);
  protected readonly connectivity = inject(ConnectivityService);

  protected readonly sparkInstrument = signal<Instrument | null>(null);
  protected readonly settingsOpen = signal(false);

  ngOnInit(): void {
    this.poller.start();
    this.binance.start();
  }

  protected readonly heroStatus = computed<string>(() => {
    const quote = this.marketView.hero()?.quote;
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
      default:
        return '';
    }
  });

  protected isDim(entry: TickerEntry): boolean {
    return entry.quote.status === 'closed' || entry.quote.status === 'unavailable';
  }

  protected openSpark(): void {
    if (!this.marketView.canOpenHeroSparkline()) return;
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
