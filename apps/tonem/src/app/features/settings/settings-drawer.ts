import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RecordedMusicPlayer } from '../../core/music/recorded-music-player';
import { instrumentById } from '../../core/instruments/instrument.registry';
import { Instrument } from '../../core/instruments/instrument.model';
import {
  BackgroundViewSettings,
  HeroMode,
  ZenSettingKey,
} from '../../core/view-settings/view-settings.model';
import { ViewSettingsStore } from '../../core/view-settings/view-settings.store';
import { AnalyticsService } from '../../core/analytics/analytics.service';

@Component({
  selector: 'app-settings-drawer',
  imports: [],
  templateUrl: './settings-drawer.html',
  styleUrl: './settings-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDrawerComponent {
  /** Public template event is `(close)`; property stays consistent with existing overlays. */
  readonly closed = output<void>({ alias: 'close' });

  protected readonly store = inject(ViewSettingsStore);
  protected readonly audio = inject(RecordedMusicPlayer);
  private readonly analytics = inject(AnalyticsService);
  protected readonly settings = this.store.settings;
  protected readonly shareState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly instruments = computed<readonly Instrument[]>(() =>
    this.store
      .instruments()
      .order.map((id) => instrumentById(id))
      .filter((instrument): instrument is Instrument => instrument !== undefined),
  );

  private readonly drawer = viewChild<ElementRef<HTMLElement>>('drawer');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  protected requestClose(): void {
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.requestClose();
  }

  protected onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.drawer()?.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected setHeroMode(event: Event): void {
    this.store.setHeroMode(this.input(event).value as HeroMode);
  }

  protected setPinned(event: Event): void {
    const instrumentId = this.input(event).value;
    this.store.setPinnedInstrument(instrumentId);
    this.analytics.track('instrument_select', { instrument_id: instrumentId });
  }

  protected setFavorite(id: string, event: Event): void {
    const enabled = this.input(event).checked;
    this.store.setFavorite(id, enabled);
    this.analytics.track('favorite_toggle', { instrument_id: id, enabled });
  }

  protected setHidden(id: string, event: Event): void {
    this.store.setInstrumentHidden(id, !this.input(event).checked);
  }

  protected move(id: string, direction: -1 | 1): void {
    this.store.moveInstrument(id, direction);
  }

  protected setZen(key: ZenSettingKey, event: Event): void {
    this.store.setZen(key, this.input(event).checked);
  }

  protected setMood(event: Event): void {
    this.store.setBackground('moodEnabled', this.input(event).checked);
  }

  protected setBackgroundNumber(
    key: 'dim' | 'blur' | 'speed',
    event: Event,
  ): void {
    this.store.setBackground(key, Number(this.input(event).value) as BackgroundViewSettings[typeof key]);
  }

  protected setSoundEnabled(event: Event): void {
    const enabled = this.input(event).checked;
    if (enabled) void this.audio.enableFromGesture();
    else this.audio.disable();
    this.analytics.track('music_toggle', { enabled });
  }

  protected setVolume(event: Event): void {
    this.audio.setVolume(Number(this.input(event).value));
  }

  protected volumePercent(): number {
    return Math.round(this.settings().sound.volume * 100);
  }

  protected async share(): Promise<void> {
    this.shareState.set('idle');
    try {
      await this.store.share();
      this.shareState.set('copied');
    } catch {
      this.shareState.set('failed');
    }
  }

  protected isFavorite(id: string): boolean {
    return this.store.hero().favorites.includes(id);
  }

  protected isHidden(id: string): boolean {
    return this.store.instruments().hidden.includes(id);
  }

  private input(event: Event): HTMLInputElement {
    return event.currentTarget as HTMLInputElement;
  }
}
