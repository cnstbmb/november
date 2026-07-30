import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { MUSIC_LIBRARY, MusicTrack } from '../../core/music/music-library';
import { MusicInfoComponent } from './music-info';

@Component({
  standalone: true,
  imports: [MusicInfoComponent],
  template: `
    <app-music-info [currentTrack]="currentTrack()" (close)="closed = true" />
  `,
})
class TestHost {
  currentTrack = signal<MusicTrack | null>(null);
  closed = false;
}

describe('MusicInfoComponent', () => {
  it('has role=dialog', async () => {
    const fixture = TestBed.createComponent(MusicInfoComponent);
    fixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.css('[role=dialog]'));
    expect(dialog).toBeTruthy();
  });

  it('emits close on backdrop click', async () => {
    const hostFixture = TestBed.createComponent(TestHost);
    hostFixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    hostFixture.detectChanges();
    const backdrop = hostFixture.debugElement.query(By.css('.music-info-backdrop'));
    expect(backdrop).toBeTruthy();
    backdrop.triggerEventHandler('click', {});
    hostFixture.detectChanges();
    expect(hostFixture.componentInstance.closed).toBe(true);
  });

  it('emits close on close button click', async () => {
    const hostFixture = TestBed.createComponent(TestHost);
    hostFixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    hostFixture.detectChanges();
    const closeBtn = hostFixture.debugElement.query(By.css('.music-info-close'));
    expect(closeBtn).toBeTruthy();
    closeBtn.triggerEventHandler('click', {});
    hostFixture.detectChanges();
    expect(hostFixture.componentInstance.closed).toBe(true);
  });

  it('shows current track title', async () => {
    const fixture = TestBed.createComponent(MusicInfoComponent);
    fixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    fixture.detectChanges();
    const title = fixture.debugElement.query(By.css('.music-info-track-title'));
    expect(title.nativeElement.textContent).toContain(MUSIC_LIBRARY[0].title);
  });

  it('shows source link', async () => {
    const fixture = TestBed.createComponent(MusicInfoComponent);
    fixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    fixture.detectChanges();
    const link = fixture.debugElement.query(By.css('.music-info-detail a'));
    expect(link).toBeTruthy();
    expect(link.nativeElement.getAttribute('href')).toBe(MUSIC_LIBRARY[0].sourceUrl);
  });

  it('lists all tracks in catalog', async () => {
    const fixture = TestBed.createComponent(MusicInfoComponent);
    fixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    fixture.detectChanges();
    const items = fixture.debugElement.queryAll(By.css('.music-info-list li'));
    expect(items.length).toBe(MUSIC_LIBRARY.length);
  });

  it('marks active track in list', async () => {
    const fixture = TestBed.createComponent(MusicInfoComponent);
    fixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[1]);
    fixture.detectChanges();
    const activeItem = fixture.debugElement.query(By.css('.music-info-active'));
    expect(activeItem).toBeTruthy();
  });

  it('references LICENSES.md in footer', async () => {
    const fixture = TestBed.createComponent(MusicInfoComponent);
    fixture.componentRef.setInput('currentTrack', MUSIC_LIBRARY[0]);
    fixture.detectChanges();
    const footerLinks = fixture.debugElement.queryAll(By.css('.music-info-footer a'));
    const licenseLink = footerLinks.find(
      (l) => l.nativeElement.getAttribute('href') === 'audio/LICENSES.md',
    );
    expect(licenseLink).toBeTruthy();
  });
});
