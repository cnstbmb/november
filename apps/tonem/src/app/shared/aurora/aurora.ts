import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Signal,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { MoodEngine } from '../../core/mood/mood.engine';
import { ReducedMotion } from '../../core/motion/reduced-motion';
import { AuroraFrame, auroraFrame } from './aurora.model';

/** Верхний предел devicePixelRatio — выше не рендерим, чтобы не жечь GPU. */
const MAX_DPR = 2;
/** Доля внутреннего разрешения от CSS-пикселей (рендерим мельче, апскейлим CSS). */
const RESOLUTION_SCALE = 0.5;
/** Количество плазменных клякс. */
const BLOB_COUNT = 4;
/** Размер тайла зерна (px, во внутреннем разрешении). */
const GRAIN_TILE = 128;
/** Прозрачность зерна. */
const GRAIN_ALPHA = 0.05;

/** Одна клякса: базовая позиция/размер/фаза, детерминированная по индексу. */
interface Blob {
  readonly bx: number; // базовый x-центр (доля ширины)
  readonly by: number; // базовый y-центр (доля высоты)
  readonly r: number; // базовый радиус (доля min(w,h))
  readonly speed: number; // собственная скорость фазы
  readonly phase: number; // начальная фаза
  readonly secondary: boolean; // true — красится secondaryHue
}

/**
 * Полноэкранный фон «аврора»: медленные плазменные градиентные кляксы на canvas.
 * Палитра/скорость/шум берутся из сглаженного настроения рынка (MoodEngine) —
 * переходы плавные, т.к. само настроение сглажено EMA.
 *
 * Производительность: внутреннее разрешение занижено (RESOLUTION_SCALE) и
 * апскейлится CSS; devicePixelRatio ограничен MAX_DPR; цикл ставится на паузу,
 * когда вкладка скрыта (visibilitychange). При prefers-reduced-motion цикл не
 * запускается вовсе — рисуется один статичный кадр.
 *
 * Zoneless: rAF-цикл живёт вне Angular (в afterNextRender, без зон), сигналы
 * только читаются. Читаемость героя обеспечивается CSS-виньеткой (см. scss).
 */
@Component({
  selector: 'app-aurora',
  imports: [],
  template: '<canvas #canvas class="aurora-canvas" aria-hidden="true"></canvas>',
  styleUrl: './aurora.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuroraComponent {
  private readonly mood: Signal<{ hue: number; energy: number; turbulence: number }> =
    inject(MoodEngine).mood;
  private readonly reduced = inject(ReducedMotion);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private running = false;
  private startTime = 0;
  private blobs: readonly Blob[] = [];
  /** Пре-рендеренный тайл зерна (CanvasPattern), создаётся один раз. */
  private grain: CanvasPattern | null = null;

  constructor() {
    afterNextRender(() => this.setup());
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /** Инициализация после первого рендера: контекст, кляксы, слушатели, старт. */
  private setup(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;

    this.blobs = this.makeBlobs();
    this.grain = this.makeGrain();
    this.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.reduced.enabled()) {
      // Статичный кадр: рисуем один раз при текущем настроении, без цикла.
      this.drawFrame(0);
    } else {
      this.startLoop();
    }
  }

  /** Останавливает цикл, снимает слушатели. */
  private teardown(): void {
    this.stopLoop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ctx = null;
  }

  /** Старт rAF-цикла (идемпотентно). */
  private startLoop(): void {
    if (this.running || this.reduced.enabled()) return;
    this.running = true;
    this.startTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Остановка rAF-цикла. */
  private stopLoop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Кадр анимации: рисуем и просим следующий, пока бежим. */
  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const t = (now - this.startTime) / 1000; // секунды с запуска
    this.drawFrame(t);
    this.rafId = requestAnimationFrame(this.frame);
  };

  /** Пауза на скрытой вкладке, возобновление на видимой. */
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.stopLoop();
    } else if (!this.reduced.enabled()) {
      // сбрасываем отсчёт времени, чтобы фаза не прыгнула на паузе
      this.startLoop();
    }
  };

  /** Пересчёт размеров canvas под вьюпорт с учётом DPR и заниженного разрешения. */
  private readonly onResize = (): void => this.resize();

  private resize(): void {
    const canvas = this.canvasRef().nativeElement;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * RESOLUTION_SCALE;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    // при статичном кадре (reduced) перерисуем после ресайза
    if (this.reduced.enabled() && this.ctx) this.drawFrame(0);
  }

  /** Детерминированный набор клякс (без рандома между кадрами). */
  private makeBlobs(): Blob[] {
    const seeds: Blob[] = [];
    for (let i = 0; i < BLOB_COUNT; i++) {
      seeds.push({
        bx: 0.2 + 0.6 * ((i * 0.37) % 1),
        by: 0.25 + 0.5 * ((i * 0.53) % 1),
        r: 0.35 + 0.2 * ((i * 0.71) % 1),
        speed: 0.6 + 0.8 * ((i * 0.29) % 1),
        phase: i * 1.7,
        secondary: i % 2 === 1,
      });
    }
    return seeds;
  }

  /**
   * Пре-рендерит маленький тайл монохромного шума и возвращает как CanvasPattern.
   * Зерно статично по содержимому (не рандомим каждый кадр — дорого и рябит),
   * «шевелится» за счёт медленного сдвига тайла в drawFrame. null — если offscreen
   * canvas недоступен (крайне редко); тогда кадр рисуется без зерна.
   */
  private makeGrain(): CanvasPattern | null {
    try {
      const tile = document.createElement('canvas');
      tile.width = GRAIN_TILE;
      tile.height = GRAIN_TILE;
      const tctx = tile.getContext('2d');
      if (!tctx || !this.ctx) return null;
      const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
      return this.ctx.createPattern(tile, 'repeat');
    } catch {
      // Зерно — опциональный слой: без него кадр всё равно валиден.
      return null;
    }
  }

  /** Отрисовка одного кадра в момент t (секунды). */
  private drawFrame(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const frame: AuroraFrame = auroraFrame(this.mood());
    const minDim = Math.min(w, h);

    ctx.clearRect(0, 0, w, h);
    // аддитивное смешивание даёт свечение авроры
    ctx.globalCompositeOperation = 'lighter';

    for (const b of this.blobs) {
      // медленное дрейфовое движение + шум от turbulence
      const drift = frame.flowSpeed * b.speed;
      const jx = Math.sin(t * 1.3 + b.phase * 2.1) * frame.jitter * 0.12;
      const jy = Math.cos(t * 1.1 + b.phase * 1.3) * frame.jitter * 0.12;
      const cx = (b.bx + Math.sin(t * drift + b.phase) * 0.18 + jx) * w;
      const cy = (b.by + Math.cos(t * drift * 0.9 + b.phase) * 0.16 + jy) * h;
      const radius = b.r * minDim * (1 + 0.15 * Math.sin(t * drift * 0.7 + b.phase));

      const hue = b.secondary ? frame.secondaryHue : frame.primaryHue;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `hsla(${hue}, ${frame.saturation}%, 60%, ${frame.alpha})`);
      grad.addColorStop(1, `hsla(${hue}, ${frame.saturation}%, 55%, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Плёнка-зерно поверх плазмы: мягкий монохромный шум, медленно ползущий.
    // Сдвиг на целые пиксели несколько раз в секунду — дёшево, без ряби.
    if (this.grain) {
      const ox = Math.floor(t * 8) % GRAIN_TILE;
      const oy = Math.floor(t * 5) % GRAIN_TILE;
      ctx.save();
      ctx.globalAlpha = GRAIN_ALPHA;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this.grain;
      // заливаем чуть больше кадра, чтобы сдвиг не оголял край
      ctx.fillRect(0, 0, w + GRAIN_TILE, h + GRAIN_TILE);
      ctx.restore();
    }
  }
}
