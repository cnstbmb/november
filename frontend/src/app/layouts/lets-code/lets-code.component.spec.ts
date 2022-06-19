import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LetsCodeComponent } from './lets-code.component';

describe('LetsCodeComponent', () => {
  let component: LetsCodeComponent;
  let fixture: ComponentFixture<LetsCodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LetsCodeComponent]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LetsCodeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
