import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RecordedMusicPlayer } from '../../core/music/recorded-music-player';
import { ViewSettingsStore } from '../../core/view-settings/view-settings.store';

@Component({
  selector: 'app-sound-control',
  imports: [],
  template: `
    <div class="sound-control-row">
      <button
        type="button"
        class="sound-button"
        [class.is-on]="settings.sound().enabled"
        [attr.aria-pressed]="settings.sound().enabled"
        [attr.aria-label]="label()"
        (click)="toggle()"
      >
        <span aria-hidden="true">{{ settings.sound().enabled ? '♫' : '♪' }}</span>
        <span class="sound-copy">{{ label() }}</span>
      </button>
      @if (settings.sound().enabled) {
        <button
          type="button"
          class="sound-next"
          (click)="player.toggleMode()"
          [attr.aria-label]="player.mode() === 'shuffle' ? 'Режим: перемешанный. Нажмите для последовательного' : 'Режим: по порядку. Нажмите для перемешанного'"
          [class.shuffle-on]="player.mode() === 'shuffle'"
        >
          {{ player.mode() === 'shuffle' ? '🔀' : '↔' }}
        </button>
        <button type="button" class="sound-next" (click)="player.next()" aria-label="Следующая запись">
          ⏭
        </button>
      }
      <button type="button" class="sound-info" (click)="openInfo.emit()" aria-label="О музыке">
        ℹ
      </button>
    </div>
  `,
  styleUrl: './sound-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundControlComponent {
  protected readonly player = inject(RecordedMusicPlayer);
  protected readonly settings = inject(ViewSettingsStore);
  readonly openInfo = output<void>();

  protected toggle(): void {
    const status = this.player.status();
    if (
      this.settings.sound().enabled &&
      (status === 'playing' || status === 'loading' || status === 'hidden')
    ) {
      this.player.disable();
    } else {
      this.player.enableFromGesture();
    }
  }

  protected label(): string {
    switch (this.player.status()) {
      case 'playing':
        return 'звук включён';
      case 'loading':
        return 'загружаем запись…';
      case 'armed':
        return 'коснуться, чтобы включить звук';
      case 'paused':
        return 'звук на паузе';
      case 'hidden':
        return 'вкладка скрыта, звук приглушён';
      case 'error':
        return 'ошибка воспроизведения';
      default:
        return 'включить звук';
    }
  }
}
