import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OdometerComponent } from './odometer';
import { ReducedMotion } from '../../core/motion/reduced-motion';

function textOf(el: HTMLElement): string {
  // читаем по верхним (видимым) ячейкам: sr-only — плоский текст
  return el.querySelector('.sr-only')?.textContent?.trim() ?? '';
}

function reelTransforms(el: HTMLElement): string[] {
  return [...el.querySelectorAll<HTMLElement>('.reel')].map((r) => r.style.transform);
}

describe('OdometerComponent', () => {
  let reduced: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    reduced = signal(false);
    TestBed.configureTestingModule({
      imports: [OdometerComponent],
      providers: [{ provide: ReducedMotion, useValue: { enabled: reduced.asReadonly() } }],
    });
  });

  afterEach(() => vi.useRealTimers());

  async function create(value: number | null, decimals = 2) {
    const fixture = TestBed.createComponent(OdometerComponent);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('decimals', decimals);
    await fixture.whenStable();
    return fixture;
  }

  it('рисует значение барабанами, по одной цифре на колонку', async () => {
    const fixture = await create(78.58, 2);
    const el = fixture.nativeElement as HTMLElement;
    expect(textOf(el)).toBe('78,58');
    // '78,58' → 4 цифры + 1 разделитель
    expect(el.querySelectorAll('.digit').length).toBe(4);
    expect(el.querySelectorAll('.sep').length).toBe(1);
  });

  it('разделители тысяч и десятичная запятая рендерятся статично', async () => {
    const fixture = await create(1234.5, 2);
    const el = fixture.nativeElement as HTMLElement;
    expect(textOf(el)).toBe('1 234,50');
    const seps = [...el.querySelectorAll('.sep')].map((s) => s.textContent);
    expect(seps).toEqual([' ', ',']);
  });

  it('null → тире, без барабанов', async () => {
    const fixture = await create(null);
    const el = fixture.nativeElement as HTMLElement;
    expect(textOf(el)).toBe('—');
    expect(el.querySelectorAll('.digit').length).toBe(0);
  });

  it('при изменении значения slot барабана движется (прокрутка)', async () => {
    const fixture = await create(5, 0);
    const el = fixture.nativeElement as HTMLElement;
    const before = reelTransforms(el)[0];

    fixture.componentRef.setInput('value', 8);
    await fixture.whenStable();
    const after = reelTransforms(el)[0];

    expect(before).not.toBe(after);
    expect(after).toContain('translateY(-'); // сместился на 3 ячейки вверх
  });

  it('рост значения → вспышка вверх, затем затухает по таймеру', async () => {
    const fixture = await create(100, 0); // стабилизируем до включения fake timers
    const el = fixture.nativeElement as HTMLElement;
    const odo = () => el.querySelector('.odometer') as HTMLElement;

    vi.useFakeTimers();
    try {
      fixture.componentRef.setInput('value', 101);
      fixture.detectChanges();
      expect(odo().classList.contains('flash-up')).toBe(true);

      vi.advanceTimersByTime(1_000); // таймер затухания флеша
      fixture.detectChanges();
      expect(odo().classList.contains('flash-up')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('падение значения → вспышка вниз', async () => {
    const fixture = await create(100, 0);
    const el = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('value', 99);
    await fixture.whenStable();
    expect(el.querySelector('.odometer')?.classList.contains('flash-down')).toBe(true);
  });

  it('равное значение → без вспышки', async () => {
    const fixture = await create(100, 0);
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('value', 100);
    await fixture.whenStable();
    const odo = el.querySelector('.odometer') as HTMLElement;
    expect(odo.classList.contains('flash-up')).toBe(false);
    expect(odo.classList.contains('flash-down')).toBe(false);
  });

  describe('prefers-reduced-motion', () => {
    beforeEach(() => reduced.set(true));

    it('без класса animated и без вспышки при изменении', async () => {
      const fixture = await create(100, 0);
      const el = fixture.nativeElement as HTMLElement;

      fixture.componentRef.setInput('value', 101);
      await fixture.whenStable();
      const odo = el.querySelector('.odometer') as HTMLElement;

      expect(odo.classList.contains('reduced')).toBe(true);
      expect(odo.classList.contains('animated')).toBe(false);
      expect(odo.classList.contains('flash-up')).toBe(false);
      expect(odo.classList.contains('flash-down')).toBe(false);
    });

    it('значение всё равно обновляется (мгновенно)', async () => {
      const fixture = await create(100, 0);
      const el = fixture.nativeElement as HTMLElement;
      fixture.componentRef.setInput('value', 250);
      await fixture.whenStable();
      expect(textOf(el)).toBe('250');
    });
  });
});
