import { Injectable, Signal, computed, inject } from '@angular/core';
import { RatesStore, TickerEntry } from '../rates/rates.store';
import { Quote } from '../rates/quote.model';
import { DERIVED_DEFS, buildDerivedQuote } from './derived.defs';

/**
 * DerivedEngine — пересчитывает производные котировки из живых в RatesStore.
 *
 * Реактивен: каждый derived-сигнал — computed от store.ticker(), поэтому
 * пересчёт происходит автоматически при любом изменении входов.
 *
 * Использование: UI читает derivedTicker (или отдельные сигналы) и рисует
 * их рядом с живыми. Недоступные производные имеют status 'unavailable' —
 * UI их скрывает, а не показывает 0.
 */
@Injectable({ providedIn: 'root' })
export class DerivedEngine {
  private readonly store = inject(RatesStore);

  /** Текущее время для вычисления статуса. Переопределяемо в тестах. */
  now: () => Date = () => new Date();

  private readonly quotesById = computed<Readonly<Record<string, Quote>>>(() => {
    const map: Record<string, Quote> = {};
    for (const entry of this.store.ticker()) {
      map[entry.instrument.id] = entry.quote;
    }
    return map;
  });

  /** Все 6 производных, в порядке реестра */
  readonly derivedTicker: Signal<readonly TickerEntry[]> = computed(() => {
    const referenceTime = this.store.historicalTarget() ?? this.now();
    return DERIVED_DEFS.map((def) => ({
      instrument: def.instrument,
      quote: buildDerivedQuote(def, this.quotesById(), referenceTime),
    }));
  });
}
