import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TimeMachineService } from '../../core/time-machine/time-machine.service';

const HOUR_MS = 60 * 60 * 1000;
const MAX_HOURS_AGO = 24 * 365;
const OPEN_GESTURE_PX = 48;

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long',
  timeStyle: 'short',
});

@Component({
  selector: 'app-time-scrubber',
  imports: [],
  templateUrl: './time-scrubber.html',
  styleUrl: './time-scrubber.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeScrubberComponent {
  protected readonly timeMachine = inject(TimeMachineService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly panelOpen = signal(false);
  protected readonly rangeHours = signal(24);
  protected readonly arbitraryValue = signal('');
  protected readonly maxDateTime = toLocalDateTimeValue(new Date());
  protected readonly maxHoursAgo = MAX_HOURS_AGO;

  private gestureStart: { x: number; y: number } | null = null;
  private hadFocusedPanel = false;

  protected readonly panelVisible = computed(
    () => this.panelOpen() || this.timeMachine.active() || this.timeMachine.error(),
  );
  protected readonly targetLabel = computed(() => {
    const target = this.timeMachine.target();
    return target ? dateTimeFormatter.format(target) : '';
  });
  protected readonly relativeLabel = computed(() => relativeTimeLabel(this.timeMachine.target()));
  protected readonly rangeLabel = computed(() => relativeHoursLabel(this.rangeHours()));
  protected readonly arbitraryValid = computed(() => {
    const target = parseLocalDateTime(this.arbitraryValue());
    return target !== null && target.getTime() <= Date.now();
  });

  constructor() {
    effect(() => {
      const target = this.timeMachine.target();
      if (!target) return;
      const hours = Math.round((Date.now() - target.getTime()) / HOUR_MS);
      this.rangeHours.set(Math.min(MAX_HOURS_AGO, Math.max(1, hours)));
      this.arbitraryValue.set(toLocalDateTimeValue(target));
    });

    effect(() => {
      const panelOwnsFocus = this.timeMachine.active() || this.timeMachine.error();
      if (panelOwnsFocus) {
        this.hadFocusedPanel = true;
        queueMicrotask(() => this.focus('.time-machine-panel'));
      } else if (this.hadFocusedPanel) {
        this.hadFocusedPanel = false;
        queueMicrotask(() => this.focus('.time-machine-open'));
      }
    });
  }

  protected togglePanel(): void {
    this.panelOpen.update((open) => !open);
    if (this.panelOpen()) queueMicrotask(() => this.focus('.time-machine-panel'));
  }

  protected closePanel(): void {
    if (this.timeMachine.active()) return;
    this.timeMachine.dismissError();
    this.panelOpen.set(false);
  }

  protected beginGesture(event: PointerEvent): void {
    this.gestureStart = { x: event.clientX, y: event.clientY };
  }

  protected endGesture(event: PointerEvent): void {
    if (!this.gestureStart) return;
    const deltaX = event.clientX - this.gestureStart.x;
    const deltaY = event.clientY - this.gestureStart.y;
    this.gestureStart = null;
    if (deltaY <= -OPEN_GESTURE_PX || Math.abs(deltaX) >= OPEN_GESTURE_PX * 1.5) {
      this.panelOpen.set(true);
    }
  }

  protected updateRange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.rangeHours.set(value);
  }

  protected commitRange(): void {
    this.timeMachine.setTarget(new Date(Date.now() - this.rangeHours() * HOUR_MS));
  }

  protected updateArbitrary(event: Event): void {
    this.arbitraryValue.set((event.target as HTMLInputElement).value);
  }

  protected commitArbitrary(): void {
    const target = parseLocalDateTime(this.arbitraryValue());
    if (target && target.getTime() <= Date.now()) this.timeMachine.setTarget(target);
  }

  protected usePreset(unit: 'day' | 'week' | 'month'): void {
    this.timeMachine.stepBack(unit);
  }

  protected returnToPresent(): void {
    this.timeMachine.setTarget(null);
    this.panelOpen.set(false);
  }

  private focus(selector: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toLocalDateTimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function relativeHoursLabel(hours: number): string {
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} дн. назад`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} мес. назад`;
  return `${Math.round(months / 12)} г. назад`;
}

function relativeTimeLabel(target: Date | null): string {
  if (!target) return '';
  const hours = Math.max(1, Math.round((Date.now() - target.getTime()) / HOUR_MS));
  return relativeHoursLabel(hours);
}
