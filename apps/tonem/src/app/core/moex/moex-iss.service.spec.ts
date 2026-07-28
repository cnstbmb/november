import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MoexIssService } from './moex-iss.service';

describe('MoexIssService', () => {
  let service: MoexIssService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MoexIssService],
    });
    service = TestBed.inject(MoexIssService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('currency-батч: один запрос со всеми secid', () => {
    service.fetchCurrencyBatch(['USD000UTSTOM', 'GLDRUB_TOM']).subscribe();
    const req = http.expectOne((r) => r.url.includes('/engines/currency/markets/selt/'));
    expect(req.request.params.get('securities')).toBe('USD000UTSTOM,GLDRUB_TOM');
    expect(req.request.params.get('iss.meta')).toBe('off');
    req.flush({ marketdata: { columns: [], data: [] } });
  });

  it('index: запрос по secid с колонкой CURRENTVALUE', () => {
    service.fetchIndex('IMOEX').subscribe();
    const req = http.expectOne((r) => r.url.includes('/engines/stock/markets/index/'));
    expect(req.request.url).toContain('IMOEX');
    expect(req.request.params.get('marketdata.columns')).toContain('CURRENTVALUE');
    req.flush({ marketdata: { columns: [], data: [] } });
  });

  it('futures: запрос доски RFUD с ASSETCODE в колонках', () => {
    service.fetchFuturesBoard().subscribe();
    const req = http.expectOne((r) => r.url.includes('/engines/futures/markets/forts/'));
    expect(req.request.url).toContain('RFUD');
    expect(req.request.params.get('securities.columns')).toContain('ASSETCODE');
    req.flush({ securities: { columns: [], data: [] }, marketdata: { columns: [], data: [] } });
  });
});
