import { describe, expect, it, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SparklineComponent } from './sparkline';
import { CandlesService } from '../../core/candles/candles.service';
import { Instrument } from '../../core/instruments/instrument.model';
import { IntradayCurve } from '../../core/candles/candle.model';

const usdrub: Instrument = {
  id: 'usdrub',
  label: 'USD/RUB',
  heroLabel: 'рублей за доллар',
  unit: '₽',
  decimals: 2,
  market: 'fx',
  placement: 'live',
  moex: { kind: 'currency', secid: 'USD000UTSTOM' },
};

const candlesOf = (closes: number[]): IntradayCurve => ({
  session: 'current',
  candles: closes.map((close, i) => ({
    close,
    ts: new Date(1785240000000 + i * 600_000),
  })),
});

function createComponent(curve: IntradayCurve) {
  TestBed.configureTestingModule({
    imports: [SparklineComponent],
    providers: [
      { provide: CandlesService, useValue: { intraday: () => of(curve) } },
    ],
  });
  const fixture = TestBed.createComponent(SparklineComponent);
  fixture.componentRef.setInput('instrument', usdrub);
  return fixture;
}

describe('SparklineComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('рендерит полилинию после загрузки', async () => {
    const fixture = createComponent(candlesOf([79.1, 79.5, 79.3, 79.6]));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const polyline = el.querySelector('polyline');
    expect(polyline).toBeTruthy();
    expect(polyline?.getAttribute('points')).not.toBe('');
    // min/max за день
    expect(el.querySelector('.extremes .min')?.textContent?.trim()).toBe('79,10');
    expect(el.querySelector('.extremes .max')?.textContent?.trim()).toBe('79,60');
  });

  it('состояние загрузки → затем рендер (loading исчезает)', async () => {
    const fixture = createComponent(candlesOf([1, 2, 3]));
    // до whenStable effect ещё не отработал с данными — но of() синхронный,
    // поэтому просто проверяем, что итог — график, а не статус.
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.status')).toBeNull();
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('пустая кривая → статус «нет данных»', async () => {
    const fixture = createComponent({ candles: [], session: 'current' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.status')?.textContent).toContain('нет данных');
    expect(el.querySelector('polyline')).toBeNull();
  });

  it('пометка «вчерашняя сессия» при session=last', async () => {
    const fixture = createComponent({ ...candlesOf([1, 2]), session: 'last' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.session')?.textContent?.trim()).toBe('вчерашняя сессия');
  });

  it('без пометки сессии при session=current', async () => {
    const fixture = createComponent(candlesOf([1, 2]));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.session')).toBeNull();
  });

  it('кнопка × эмитит closed', async () => {
    const fixture = createComponent(candlesOf([1, 2, 3]));
    await fixture.whenStable();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    (fixture.nativeElement.querySelector('.close') as HTMLButtonElement).click();
    expect(closed).toBe(1);
  });

  it('тап по бэкдропу (не по карточке) эмитит closed', async () => {
    const fixture = createComponent(candlesOf([1, 2, 3]));
    await fixture.whenStable();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;
    backdrop.click(); // target === currentTarget
    expect(closed).toBe(1);
  });

  it('клик внутри карточки НЕ закрывает', async () => {
    const fixture = createComponent(candlesOf([1, 2, 3]));
    await fixture.whenStable();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    (fixture.nativeElement.querySelector('.sheet') as HTMLElement).click();
    expect(closed).toBe(0);
  });

  it('свайп вниз больше порога закрывает', async () => {
    const fixture = createComponent(candlesOf([1, 2, 3]));
    await fixture.whenStable();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;

    backdrop.dispatchEvent(touchEvt('touchstart', 100));
    backdrop.dispatchEvent(touchEvt('touchend', 200)); // +100px > порога
    expect(closed).toBe(1);
  });

  it('короткий свайп не закрывает', async () => {
    const fixture = createComponent(candlesOf([1, 2, 3]));
    await fixture.whenStable();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLElement;

    backdrop.dispatchEvent(touchEvt('touchstart', 100));
    backdrop.dispatchEvent(touchEvt('touchend', 120)); // +20px < порога
    expect(closed).toBe(0);
  });
});

/** Минимальный TouchEvent-подобный объект для тестов jsdom. */
function touchEvt(type: string, y: number): Event {
  const ev = new Event(type, { bubbles: true });
  Object.defineProperty(ev, 'touches', { value: [{ clientY: y }] });
  Object.defineProperty(ev, 'changedTouches', { value: [{ clientY: y }] });
  return ev;
}
