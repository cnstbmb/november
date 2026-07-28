import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Instrument } from '../../core/instruments/instrument.model';
import { CandlesService } from '../../core/candles/candles.service';
import { IntradayCurve } from '../../core/candles/candle.model';
import { ReducedMotion } from '../../core/motion/reduced-motion';
import { formatValue } from '../../core/rates/value.format';
import {
  DEFAULT_SCALE,
  minMax,
  pointsAttr,
  toPolylinePoints,
} from './polyline';

/** Порог свайпа вниз (px), после которого закрываем оверлей. */
const SWIPE_CLOSE_PX = 60;

/**
 * Модальный спарклайн: тёмный полноэкранный бэкдроп, по центру — SVG-кривая
 * внутридневной сессии инструмента с подписями min/max за день.
 *
 * Закрытие: кнопка ×, тап по бэкдропу или свайп вниз — всё эмитит `closed`.
 * Уважает prefers-reduced-motion: без анимации появления, просто показывается.
 *
 * Интеграция: <app-sparkline [instrument]="inst" (closed)="onClosed()" />
 */
@Component({
  selector: 'app-sparkline',
  imports: [],
  templateUrl: './sparkline.html',
  styleUrl: './sparkline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparklineComponent {
  /** Инструмент, чью кривую показываем. */
  readonly instrument = input.required<Instrument>();
  /** Сигнал родителю: оверлей просят закрыть. */
  readonly closed = output<void>();

  private readonly candles = inject(CandlesService);
  protected readonly reduced = inject(ReducedMotion);

  protected readonly state = signal<'loading' | 'ready' | 'empty'>('loading');
  protected readonly curve = signal<IntradayCurve>({ candles: [], session: 'current' });

  /** Начало вертикального жеста (для свайпа вниз). */
  private touchStartY: number | null = null;

  protected readonly points = computed(() => {
    const closes = this.curve().candles.map((c) => c.close);
    return pointsAttr(toPolylinePoints(closes, DEFAULT_SCALE));
  });

  /** направление дня: вверх / вниз / ровно — для цвета линии */
  protected readonly trend = computed<'up' | 'down' | 'flat'>(() => {
    const cs = this.curve().candles;
    if (cs.length < 2) return 'flat';
    const first = cs[0].close;
    const last = cs[cs.length - 1].close;
    if (last > first) return 'up';
    if (last < first) return 'down';
    return 'flat';
  });

  protected readonly dayMin = computed(() => {
    const closes = this.curve().candles.map((c) => c.close);
    return this.fmt(minMax(closes).min);
  });

  protected readonly dayMax = computed(() => {
    const closes = this.curve().candles.map((c) => c.close);
    return this.fmt(minMax(closes).max);
  });

  protected readonly sessionNote = computed(() =>
    this.curve().session === 'last' ? 'вчерашняя сессия' : '',
  );

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  constructor() {
    effect(() => {
      const inst = this.instrument();
      this.state.set('loading');
      this.candles.intraday(inst).subscribe((curve) => {
        this.curve.set(curve);
        this.state.set(curve.candles.length > 0 ? 'ready' : 'empty');
      });
    });
    // Фокус — на кнопку закрытия: диалог модальный, Esc/клик закрывают.
    afterNextRender(() => this.closeBtn()?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      /* подписка effect'а закроется вместе с компонентом */
    });
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Тап по затемнению (не по карточке) — закрыть. */
  protected onBackdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.close();
  }

  protected onTouchStart(ev: TouchEvent): void {
    this.touchStartY = ev.touches[0]?.clientY ?? null;
  }

  protected onTouchEnd(ev: TouchEvent): void {
    if (this.touchStartY === null) return;
    const endY = ev.changedTouches[0]?.clientY;
    if (endY !== undefined && endY - this.touchStartY > SWIPE_CLOSE_PX) {
      this.close();
    }
    this.touchStartY = null;
  }

  private fmt(value: number | null): string {
    return value === null ? '—' : formatValue(value, this.instrument().decimals);
  }
}
