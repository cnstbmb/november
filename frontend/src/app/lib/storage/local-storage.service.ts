import { Injectable } from '@angular/core';
import { Storage } from '@app/lib/storage/storage';

@Injectable()
export class LocalStorageService implements Storage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
}
