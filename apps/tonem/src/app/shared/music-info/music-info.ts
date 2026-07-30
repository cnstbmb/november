import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MUSIC_LIBRARY, MusicTrack } from '../../core/music/music-library';

@Component({
  selector: 'app-music-info',
  imports: [],
  template: `
    <div class="music-info-backdrop" (click)="close.emit()" (keydown.escape)="close.emit()"></div>
    <div
      class="music-info-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Информация о музыке"
      (keydown.escape)="close.emit()"
    >
      <button class="music-info-close" type="button" (click)="close.emit()" aria-label="Закрыть">
        ×
      </button>
      <h2 class="music-info-title">Музыка</h2>

      @if (currentTrack(); as track) {
        <section class="music-info-current">
          <h3>Сейчас играет</h3>
          <p class="music-info-track-title">{{ track.title }}</p>
          <p class="music-info-detail">Композитор и исполнитель: {{ track.composer === track.performer ? track.composer : track.composer + ', ' + track.performer }}</p>
          <p class="music-info-detail">
            <a [href]="track.sourceUrl" target="_blank" rel="noopener noreferrer">
              Источник записи (OpenGameArt)
            </a>
          </p>
          <p class="music-info-detail">Лицензия: {{ track.license }}</p>
        </section>
      }

      <section class="music-info-catalog">
        <h3>Все записи ({{ tracks().length }})</h3>
        <ul class="music-info-list">
          @for (t of tracks(); track t.id) {
            <li [class.music-info-active]="t.id === currentTrack()?.id">
              <span class="music-info-list-title">{{ t.title }}</span>
              <span class="music-info-list-composer">— {{ t.composer }}</span>
              <span class="music-info-list-license">({{ t.license }})</span>
            </li>
          }
        </ul>
      </section>

      <footer class="music-info-footer">
        <p>Все записи распространяются под лицензией Creative Commons Zero (CC0 1.0 Universal) — Public Domain. Подробные метаданные: <a href="audio/LICENSES.md" target="_blank" rel="noopener noreferrer">LICENSES.md</a></p>
        <p>Музыка не зависит от рыночных данных и не использует генеративные алгоритмы.</p>
      </footer>
    </div>
  `,
  styleUrl: './music-info.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MusicInfoComponent {
  readonly currentTrack = input<MusicTrack | null>(null);
  readonly close = output<void>();

  protected readonly tracks = (): readonly MusicTrack[] => MUSIC_LIBRARY;
}
