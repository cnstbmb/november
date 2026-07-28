import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RatesStore, TickerEntry } from './core/rates/rates.store';
import { RatesPoller } from './core/rates/rates-poller.service';
import { BinanceWsService } from './core/binance/binance-ws.service';
import { DerivedEngine } from './core/derived/derived.engine';
import { formatTime } from './core/rates/value.format';
import { Instrument } from './core/instruments/instrument.model';
import { OdometerComponent } from './shared/odometer/odometer';
import { AuroraComponent } from './shared/aurora/aurora';
import { SparklineComponent } from './shared/sparkline/sparkline';

@Component({
  selector: 'app-root',
  imports: [OdometerComponent, AuroraComponent, SparklineComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly poller = inject(RatesPoller);
  private readonly binance = inject(BinanceWsService);
  private readonly derived = inject(DerivedEngine);
  protected readonly store = inject(RatesStore);

  /** Инструмент, чей спарклайн открыт (null — оверлей закрыт). */
  protected readonly sparkInstrument = signal<Instrument | null>(null);

  ngOnInit(): void {
    this.poller.start();
    this.binance.start();
  }

  /**
   * Полная лента: живые котировки + производные.
   * store.ticker() мапит весь реестр (включая derived-позиции с unavailableQuote),
   * поэтому живые берём фильтром по placement, а производные — из DerivedEngine.
   * Производные с недоступным сырьём честно скрыты, а не показаны нулём.
   */
  protected readonly fullTicker = computed<readonly TickerEntry[]>(() => [
    ...this.store.ticker().filter((e) => e.instrument.placement === 'live'),
    ...this.derived.derivedTicker().filter((e) => e.quote.status !== 'unavailable'),
  ]);

  /** Статусная строка под героем: честное состояние данных */
  protected readonly heroStatus = computed<string>(() => {
    const { quote } = this.store.hero();
    if (quote.source === 'cbr') return 'курс ЦБ РФ';
    switch (quote.status) {
      case 'closed': {
        const t = formatTime(quote.time);
        return t ? `торги закрыты · последняя цена в ${t}` : 'торги закрыты';
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
    this.sparkInstrument.set(this.store.hero().instrument);
  }

  protected closeSpark(): void {
    this.sparkInstrument.set(null);
  }
}
