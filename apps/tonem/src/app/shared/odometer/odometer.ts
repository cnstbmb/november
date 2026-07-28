import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  Direction,
  FLASH_DURATION_MS,
  FlashKind,
  directionOf,
  flashOf,
} from '../../core/motion/quote-motion';
import { DigitRoll, OdometerReel, REEL_LENGTH } from '../../core/motion/odometer-reel';
import { ReducedMotion } from '../../core/motion/reduced-motion';
import { formatValue } from '../../core/rates/value.format';

/**
 * Презентационный одометр: рисует число барабанами цифр с прокруткой
 * (CSS transform translateY) и вспышкой зелёный/красный при изменении.
 *
 * Самодостаточен: форматирует значение через formatValue, сам считает
 * направление и прокрутку. Уважает prefers-reduced-motion — при нём
 * рендерится статично, без переходов и вспышек.
 *
 * Интеграция: <app-odometer [value]="quote.value" [decimals]="instrument.decimals" />
 */
@Component({
  selector: 'app-odometer',
  imports: [],
  templateUrl: './odometer.html',
  styleUrl: './odometer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OdometerComponent {
  /** Значение котировки (null — нет данных, рисуем тире). */
  readonly value = input<number | null>(null);
  /** Знаков после запятой — должно совпадать с instrument.decimals. */
  readonly decimals = input<number>(2);

  protected readonly reduced = inject(ReducedMotion);

  /** Лента 0..9 × REEL_CYCLES для отрисовки барабанов. */
  protected readonly strip: readonly number[] = Array.from(
    { length: REEL_LENGTH },
    (_, i) => i % 10,
  );

  /** Колонки текущего значения (цифры с slot'ами + разделители). */
  protected readonly digits = signal<readonly DigitRoll[]>([]);
  /** Плоский текст для скринридера (барабаны скрыты через aria-hidden). */
  protected readonly srText = signal<string>('');
  /** Активная вспышка контейнера. */
  protected readonly flash = signal<FlashKind>('none');
  /** Включаем CSS-переходы только после первого рендера (иначе "проезд" с нуля). */
  protected readonly ready = signal(false);

  private readonly reel = new OdometerReel();
  private prevValue: number | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Переходы — только после того, как начальные slot'ы уже отрисованы.
    afterNextRender(() => this.ready.set(true));

    effect(() => {
      const nextValue = this.value();
      const decimals = this.decimals();
      const reducedMotion = this.reduced.enabled();

      const direction: Direction = directionOf(this.prevValue, nextValue);
      const text = formatValue(nextValue, decimals);
      // reduced-motion → прокрутка в 'flat': барабан ставится мгновенно.
      const rolls = this.reel.update(text, reducedMotion ? 'flat' : direction);
      this.digits.set(rolls);
      this.srText.set(text);
      this.applyFlash(flashOf(direction, reducedMotion));
      this.prevValue = nextValue;
    });

    inject(DestroyRef).onDestroy(() => this.clearFlashTimer());
  }

  /** translateY барабана: показываем slot-ю ячейку ленты. */
  protected reelTransform(slot: number): string {
    return `translateY(${-slot}em)`;
  }

  private applyFlash(kind: FlashKind): void {
    this.clearFlashTimer();
    if (kind === 'none') {
      this.flash.set('none');
      return;
    }
    this.flash.set(kind);
    // снимаем класс по окончании CSS-анимации, чтобы следующий тик мог вспыхнуть снова
    this.flashTimer = setTimeout(() => {
      this.flash.set('none');
      this.flashTimer = null;
    }, FLASH_DURATION_MS);
  }

  private clearFlashTimer(): void {
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
  }
}
