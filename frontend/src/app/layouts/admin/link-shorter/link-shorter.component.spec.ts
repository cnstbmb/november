import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkShorterComponent } from './link-shorter.component';

describe('LinkShorterComponent', () => {
  let component: LinkShorterComponent;
  let fixture: ComponentFixture<LinkShorterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LinkShorterComponent]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LinkShorterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
