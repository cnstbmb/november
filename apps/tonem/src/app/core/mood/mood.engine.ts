import { DestroyRef, Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { liveInstruments } from '../instruments/instrument.registry';
import { RatesStore } from '../rates/rates.store';
import {
  MOOD_EMA_ALPHA,
  MOOD_TICK_MS,
  MarketMood,
  MoodSample,
  SmoothedMood,
  aggregateMood,
  neutralMood,
  smoothMood,
} from './mood.model';
import { MOOD_VAR_ENERGY, MOOD_VAR_HUE, MOOD_VAR_TURBULENCE, moodCssValues } from './mood.palette';

/**
 * Движок настроения рынка. Читает живые котировки из RatesStore, агрегирует их
 * в настроение (mood.model) и сглаживает EMA (десятки секунд), чтобы палитра
 * менялась плавно и без скачков.
 *
 * Результат — сигналы `hue/energy/turbulence` (сглаженные) и запись CSS
 * custom properties на :root (эффект). Движок самодостаточен: достаточно
 * одного inject(...) в корне приложения, чтобы он начал работать.
 *
 * Базовая линия — first-seen значение каждого инструмента за время жизни
 * движка (по сути, открытие сессии с точки зрения клиента).
 */
@Injectable({ providedIn: 'root' })
export class MoodEngine {
  private readonly store = inject(RatesStore);

  /** first-seen значения по instrumentId. */
  private readonly baselines = new Map<string, number>();

  /** Сглаженное настроение — единственный источник истины. */
  private readonly moodSignal = signal<SmoothedMood>(neutralMood());

  /** Полное сглаженное настроение (все три канала разом). */
  readonly mood: Signal<SmoothedMood> = this.moodSignal.asReadonly();
  /** Направление рынка ∈ [-1,+1]: <0 падение (холод), >0 рост (тепло). */
  readonly hue: Signal<number> = computed(() => this.mood().hue);
  /** Энергия рынка ∈ [0,1]: насколько активно движение. */
  readonly energy: Signal<number> = computed(() => this.mood().energy);
  /** Турбулентность ∈ [0,1]: разброс/несогласованность инструментов. */
  readonly turbulence: Signal<number> = computed(() => this.mood().turbulence);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Фиксируем baseline сразу: первый тик не должен считать текущее значение
    // за базовое (иначе дельта всегда 0 на старте).
    this.collectSamples();

    // Пишем сглаженное настроение в CSS custom properties на :root. Эффект
    // срабатывает на каждое обновление moodSignal (каденс тика), DOM-запись —
    // три setProperty, дёшево.
    effect(() => {
      const css = moodCssValues(this.mood());
      const root = document.documentElement.style;
      root.setProperty(MOOD_VAR_HUE, css.hue);
      root.setProperty(MOOD_VAR_ENERGY, css.energy);
      root.setProperty(MOOD_VAR_TURBULENCE, css.turbulence);
    });

    inject(DestroyRef).onDestroy(() => this.stop());
    this.start();
  }

  /** Запускает тик EMA. Идемпотентно. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), MOOD_TICK_MS);
  }

  /** Останавливает тик. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Один шаг: собирает образцы из живых котировок, считает мгновенное настроение
   * и делает шаг EMA к нему. Вынесен из setInterval, чтобы тестировать напрямую.
   */
  tick(alpha = MOOD_EMA_ALPHA): void {
    const samples = this.collectSamples();
    // Пока данных нет вовсе — держим нейтраль, не дёргаем палитру.
    if (samples.length === 0) return;
    const target: MarketMood = aggregateMood(samples);
    this.moodSignal.update((current) => smoothMood(current, target, alpha));
  }

  /**
   * Образцы {id, baseline, current} по всем живым инструментам, у которых есть
   * числовое значение. Побочно фиксирует baseline при первом появлении цены.
   */
  private collectSamples(): MoodSample[] {
    const samples: MoodSample[] = [];
    for (const instrument of liveInstruments()) {
      const value = this.store.quoteOf(instrument.id)?.value;
      if (value === null || value === undefined) continue;
      const baseline = this.baselineFor(instrument.id, value);
      samples.push({ id: instrument.id, baseline, current: value });
    }
    return samples;
  }

  /** Возвращает baseline инструмента, при первом обращении — запоминает текущее значение. */
  private baselineFor(id: string, value: number): number {
    const existing = this.baselines.get(id);
    if (existing !== undefined) return existing;
    this.baselines.set(id, value);
    return value;
  }
}
