import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuroraComponent } from './aurora';
import { MoodEngine } from '../../core/mood/mood.engine';
import { ReducedMotion } from '../../core/motion/reduced-motion';
import { neutralMood } from '../../core/mood/mood.model';

/** Минимальный мок 2d-контекста: только то, что дёргает компонент. */
function stubContext(canvas: HTMLCanvasElement) {
  const gradient = { addColorStop: vi.fn() };
  const imageData = { data: new Uint8ClampedArray(GRAIN_TILE_STUB * GRAIN_TILE_STUB * 4) };
  const ctx = {
    canvas,
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createPattern: vi.fn(() => ({ __pattern: true })),
    createImageData: vi.fn(() => imageData),
    putImageData: vi.fn(),
    set fillStyle(_v: unknown) {},
    set globalAlpha(_v: unknown) {},
    set globalCompositeOperation(_v: unknown) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, gradient };
}

const GRAIN_TILE_STUB = 128;

describe('AuroraComponent', () => {
  let mood: ReturnType<typeof signal>;
  let reduced: ReturnType<typeof signal<boolean>>;
  let rafCallbacks: FrameRequestCallback[];
  let rafIds: number;

  beforeEach(() => {
    mood = signal(neutralMood());
    reduced = signal(false);
    rafCallbacks = [];
    rafIds = 0;

    TestBed.configureTestingModule({
      imports: [AuroraComponent],
      providers: [
        { provide: MoodEngine, useValue: { mood: mood.asReadonly() } },
        { provide: ReducedMotion, useValue: { enabled: reduced.asReadonly() } },
      ],
    });

    // Мокаем canvas 2d-контекст (мемоизируем по canvas, чтобы компонент и тест
    // видели один и тот же ctx).
    const ctxByCanvas = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      let ctx = ctxByCanvas.get(this);
      if (!ctx) {
        ctx = stubContext(this).ctx;
        ctxByCanvas.set(this, ctx);
      }
      return ctx as never;
    });

    // Мокаем rAF: сохраняем колбэки, запускаем вручную.
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return ++rafIds;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    // Гасим все живые фикстуры, чтобы их rAF-колбэки не утекали в следующий тест.
    for (const f of fixtures) f.destroy();
    fixtures.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const fixtures: import('@angular/core/testing').ComponentFixture<AuroraComponent>[] = [];

  async function create() {
    const fixture = TestBed.createComponent(AuroraComponent);
    fixtures.push(fixture);
    await fixture.whenStable();
    return fixture;
  }

  /** Прогоняет n кадров rAF. */
  function pumpFrames(n: number, t0 = 0, step = 16.7) {
    for (let i = 0; i < n; i++) {
      const cbs = rafCallbacks.splice(0);
      cbs.forEach((cb) => cb(t0 + i * step));
    }
  }

  /** Достаёт ctx-мок конкретного canvas для проверки вызовов отрисовки. */
  function ctxOf(fixture: (typeof fixtures)[number]) {
    const canvas = (fixture.nativeElement as HTMLElement).querySelector(
      'canvas',
    ) as HTMLCanvasElement;
    return canvas.getContext('2d') as unknown as {
      fill: ReturnType<typeof vi.fn>;
      clearRect: ReturnType<typeof vi.fn>;
    };
  }

  it('создаётся и находит canvas', async () => {
    const fixture = await create();
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas')).toBeTruthy();
  });

  it('без reduced-motion запускает rAF-цикл (кадры рисуются повторно)', async () => {
    const fixture = await create();
    const ctx = ctxOf(fixture);
    const afterSetup = ctx.fill.mock.calls.length;
    pumpFrames(3);
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(afterSetup);
  });

  it('при reduced-motion рисует один статичный кадр и не анимирует', async () => {
    reduced.set(true);
    const fixture = await create();
    const ctx = ctxOf(fixture);
    const afterSetup = ctx.fill.mock.calls.length;
    expect(afterSetup).toBeGreaterThan(0); // статичный кадр отрисован

    pumpFrames(5); // прокручиваем кадры — компонент не должен перерисовываться
    expect(ctx.fill.mock.calls.length).toBe(afterSetup);
  });

  it('скрытие вкладки останавливает цикл', async () => {
    const fixture = await create();
    const ctx = ctxOf(fixture);

    pumpFrames(2);
    const beforeHide = ctx.fill.mock.calls.length;
    expect(beforeHide).toBeGreaterThan(0); // цикл бежит

    // эмулируем visibilitychange → hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    pumpFrames(3); // кадры крутятся (планировщик Angular), но компонент не рисует
    expect(ctx.fill.mock.calls.length).toBe(beforeHide);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('возврат на видимую вкладку возобновляет цикл', async () => {
    const fixture = await create();
    const ctx = ctxOf(fixture);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    pumpFrames(2);
    const whileHidden = ctx.fill.mock.calls.length;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    pumpFrames(3);
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(whileHidden); // снова рисует
  });

  it('уничтожение компонента снимает цикл и слушатели', async () => {
    const fixture = await create();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    fixture.destroy();
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
