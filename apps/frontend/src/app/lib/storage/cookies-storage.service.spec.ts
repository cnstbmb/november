import { TestBed } from '@angular/core/testing';
import { CookieService } from 'ngx-cookie-service';

import { CookiesStorageService } from './cookies-storage.service';

describe('CookiesStorageService', () => {
  let service: CookiesStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CookiesStorageService, { provide: CookieService, useValue: {} }]
    });
    service = TestBed.inject(CookiesStorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
