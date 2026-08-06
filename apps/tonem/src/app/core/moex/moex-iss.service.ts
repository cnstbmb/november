import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const ISS_BASE = 'https://iss.moex.com/iss';

/**
 * Тонкий клиент MOEX ISS. Три запроса покрывают все инструменты первой очереди:
 * валютный батч (secid'ы через запятую), листинг доски фьючерсов, один индекс.
 */
@Injectable({ providedIn: 'root' })
export class MoexIssService {
  private readonly http = inject(HttpClient);

  fetchCurrencyBatch(secids: readonly string[]): Observable<unknown> {
    return this.http.get(`${ISS_BASE}/engines/currency/markets/selt/boards/CETS/securities.json`, {
      params: {
        'iss.meta': 'off',
        'iss.only': 'marketdata',
        securities: secids.join(','),
        'marketdata.columns': 'SECID,LAST,MARKETPRICE,TIME,SYSTIME',
      },
    });
  }

  fetchIndex(secid: string): Observable<unknown> {
    return this.http.get(`${ISS_BASE}/engines/stock/markets/index/securities/${secid}.json`, {
      params: {
        'iss.meta': 'off',
        'iss.only': 'marketdata',
        'marketdata.columns': 'SECID,CURRENTVALUE,LAST,TIME,SYSTIME',
      },
    });
  }

  fetchFuturesBoard(): Observable<unknown> {
    return this.http.get(
      `${ISS_BASE}/engines/futures/markets/forts/boards/RFUD/securities.json`,
      {
        params: {
          'iss.meta': 'off',
          'iss.only': 'securities,marketdata',
          'securities.columns': 'SECID,ASSETCODE,LASTTRADEDATE',
          'marketdata.columns': 'SECID,LAST,SETTLEPRICE,OPENPOSITION,TIME,SYSTIME',
        },
      },
    );
  }
}
