import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RawQuote } from '../rates/quote.model';
import { parseBackendKrakenQuotes } from './backend-latest.parser';

export const BACKEND_LATEST_API_BASE = new InjectionToken<string>('BACKEND_LATEST_API_BASE', {
  providedIn: 'root',
  factory: () => 'https://api.tonem.ru',
});

@Injectable({ providedIn: 'root' })
export class BackendLatestService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(BACKEND_LATEST_API_BASE).replace(/\/$/, '');

  fetchKrakenQuotes(): Observable<RawQuote[]> {
    return this.http.get<unknown>(`${this.apiBase}/latest`).pipe(map(parseBackendKrakenQuotes));
  }
}
