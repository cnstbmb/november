import { Injectable } from '@angular/core';
import { Storage } from '@app/lib/storage/storage';
import { CookieService } from 'ngx-cookie-service';

@Injectable()
export class CookiesStorageService implements Storage {
  constructor(private readonly cookieService: CookieService) {}

  getItem(key: string): string | null {
    return this.cookieService.get(key) || null;
  }

  removeItem(key: string): void {
    this.cookieService.delete(key);
  }

  setItem(key: string, value: string, expires?: Date): void {
    this.cookieService.set(key, value, expires);
  }
}
