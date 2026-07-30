import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeMachineService } from '../../core/time-machine/time-machine.service';
import { TimeScrubberComponent } from './time-scrubber';

function pointerEvent(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
  });
  return event;
}

describe('TimeScrubberComponent', () => {
  const target = signal<Date | null>(null);
  const loading = signal(false);
  const error = signal(false);
  const service = {
    target: target.asReadonly(),
    active: computed(() => target() !== null),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    setTarget: vi.fn((value: Date | null) => target.set(value)),
    stepBack: vi.fn(),
    dismissError: vi.fn(() => error.set(false)),
  };

  beforeEach(() => {
    target.set(null);
    loading.set(false);
    error.set(false);
    service.setTarget.mockClear();
    service.stepBack.mockClear();
    service.dismissError.mockClear();
    TestBed.configureTestingModule({
      imports: [TimeScrubberComponent],
      providers: [{ provide: TimeMachineService, useValue: service }],
    });
  });

  it('opens accessibly from the button and exposes range, presets and arbitrary datetime', async () => {
    const fixture = TestBed.createComponent(TimeScrubberComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const open = el.querySelector('.time-machine-open') as HTMLButtonElement;

    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.time-machine-panel')).toBeNull();
    open.click();
    await fixture.whenStable();

    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('input[type="range"]')).toBeTruthy();
    expect(el.querySelector('input[type="datetime-local"]')).toBeTruthy();
    expect(el.querySelectorAll('.scrubber-preset')).toHaveLength(3);
  });

  it('opens from an upward swipe gesture on the launcher', async () => {
    const fixture = TestBed.createComponent(TimeScrubberComponent);
    await fixture.whenStable();
    const launcher = fixture.nativeElement.querySelector('.time-machine-launcher') as HTMLElement;

    launcher.dispatchEvent(pointerEvent('pointerdown', 20, 100));
    launcher.dispatchEvent(pointerEvent('pointerup', 22, 30));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.time-machine-panel')).toBeTruthy();
  });

  it('commits range and preset controls to the service', async () => {
    const fixture = TestBed.createComponent(TimeScrubberComponent);
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('.time-machine-open') as HTMLButtonElement).click();
    await fixture.whenStable();

    const range = fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '48';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(service.setTarget).toHaveBeenCalledOnce();
    expect(service.setTarget.mock.calls[0][0]).toBeInstanceOf(Date);

    (fixture.nativeElement.querySelector('.scrubber-preset') as HTMLButtonElement).click();
    expect(service.stepBack).toHaveBeenCalledWith('day');
  });

  it('keeps fail-open feedback visible after history returns to live', async () => {
    error.set(true);
    const fixture = TestBed.createComponent(TimeScrubberComponent);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.nativeElement.querySelector('.time-machine-panel')).toBeTruthy();
    expect(text).toContain('История недоступна');

    (fixture.nativeElement.querySelector('.scrubber-close') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(service.dismissError).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.time-machine-panel')).toBeNull();
  });

  it('moves focus into history and restores it to the launcher on return', async () => {
    const fixture = TestBed.createComponent(TimeScrubberComponent);
    await fixture.whenStable();

    target.set(new Date('2026-07-28T12:34:00.000Z'));
    await fixture.whenStable();
    await Promise.resolve();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.time-machine-panel'));

    (fixture.nativeElement.querySelector('.scrubber-return') as HTMLButtonElement).click();
    await fixture.whenStable();
    await Promise.resolve();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.time-machine-open'));
  });

  it('shows an obvious past badge with both date and time and returns to present', async () => {
    target.set(new Date('2026-07-28T12:34:00.000Z'));
    const fixture = TestBed.createComponent(TimeScrubberComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const badge = el.querySelector('.scrubber-badge')?.textContent ?? '';
    expect(badge).toContain('прошлое');
    expect(badge).toMatch(/28/);
    expect(badge).toMatch(/\d{1,2}:34/);

    (el.querySelector('.scrubber-return') as HTMLButtonElement).click();
    expect(service.setTarget).toHaveBeenCalledWith(null);
  });
});
