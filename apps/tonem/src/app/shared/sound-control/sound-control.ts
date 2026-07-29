import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AmbientAudioEngine } from '../../core/audio/ambient-audio.engine';
import { ViewSettingsStore } from '../../core/view-settings/view-settings.store';

@Component({
  selector: 'app-sound-control',
  imports: [],
  template: `
    <button
      type="button"
      class="sound-button"
      [class.is-on]="settings.sound().enabled"
      [attr.aria-pressed]="settings.sound().enabled"
      [attr.aria-label]="label()"
      (click)="toggle()"
    >
      <span aria-hidden="true">{{ settings.sound().enabled ? '◉' : '○' }}</span>
      <span class="sound-copy">{{ label() }}</span>
    </button>
  `,
  styleUrl: './sound-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundControlComponent {
  protected readonly audio = inject(AmbientAudioEngine);
  protected readonly settings = inject(ViewSettingsStore);

  protected toggle(): void {
    const status = this.audio.status();
    if (this.settings.sound().enabled && (status === 'playing' || status === 'starting' || status === 'hidden')) {
      this.audio.disable();
    } else {
      void this.audio.enableFromGesture();
    }
  }

  protected label(): string {
    switch (this.audio.status()) {
      case 'playing': return 'звук включён';
      case 'starting': return 'настраиваем эфир…';
      case 'armed': return 'коснуться, чтобы включить звук';
      case 'hidden': return 'звук на паузе';
      case 'blocked': return 'ещё раз, браузер не поверил';
      case 'unsupported': return 'звук здесь не поддерживается';
      case 'error': return 'звук сегодня молчит';
      default: return 'включить звук';
    }
  }
}
