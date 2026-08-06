import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendFallbackQuotes, parseBackendFallbackQuotes } from './backend-latest.parser';

export const BACKEND_LATEST_API_BASE = new InjectionToken<string>('BACKEND_LATEST_API_BASE', {
  providedIn: 'root',
  factory: () => 'https://api.tonem.ru',
});

@Injectable({ providedIn: 'root' })
export class BackendLatestService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(BACKEND_LATEST_API_BASE).replace(/\/$/, '');

  fetchFallbackQuotes(): Observable<BackendFallbackQuotes> {
    return this.http.get<unknown>(`${this.apiBase}/latest`).pipe(map(parseBackendFallbackQuotes));
  }
}
