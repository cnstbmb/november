import { Component, OnInit, computed, inject } from '@angular/core';
import { RatesStore, TickerEntry } from './core/rates/rates.store';
import { RatesPoller } from './core/rates/rates-poller.service';
import { formatTime, formatValue } from './core/rates/value.format';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly poller = inject(RatesPoller);
  protected readonly store = inject(RatesStore);

  ngOnInit(): void {
    this.poller.start();
  }

  protected valueOf(entry: TickerEntry): string {
    return formatValue(entry.quote.value, entry.instrument.decimals);
  }

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
}
