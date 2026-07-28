import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const CBR_DAILY_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

/** Фолбэк-источник: официальные курсы ЦБ, раз в день */
@Injectable({ providedIn: 'root' })
export class CbrService {
  private readonly http = inject(HttpClient);

  fetchDaily(): Observable<unknown> {
    return this.http.get(CBR_DAILY_URL);
  }
}
