import { Instrument } from '../instruments/instrument.model';
import { instrumentById } from '../instruments/instrument.registry';
import { Quote, QuoteStatus, unavailableQuote } from '../rates/quote.model';
import { deriveStatus } from '../moex/market-hours';

/**
 * Производные инструменты — считаются на лету из живых котировок.
 *
 * Каждая производная объявляет:
 *  - inputs:   id'ы живых инструментов, от которых зависит формула
 *  - compute:  чистая функция от живых котировок → число или null
 *
 * Честность: если любой вход отсутствует (value === null) или недоступен
 * (status === 'unavailable'), результат — null → UI скрывает позицию,
 * а не рисует ложный ноль.
 */

export interface DerivedDef {
  readonly instrument: Instrument;
  readonly inputs: readonly string[];
  readonly compute: (quotes: Readonly<Record<string, Quote>>) => number | null;
}

// ── Формулы ───────────────────────────────────────────────────────────────

/** EUR/USD = EUR/RUB ÷ USD/RUB (кросс через рубль) */
function computeEurusd(q: Readonly<Record<string, Quote>>): number | null {
  const eurrub = q['eurrub']?.value;
  const usdrub = q['usdrub']?.value;
  if (eurrub == null || usdrub == null) return null;
  return eurrub / usdrub;
}

/** BTC/RUB = BTC ($) × USD/RUB */
function computeBtcrub(q: Readonly<Record<string, Quote>>): number | null {
  const btc = q['btc']?.value;
  const usdrub = q['usdrub']?.value;
  if (btc == null || usdrub == null) return null;
  return btc * usdrub;
}

/**
 * BTC в золоте = BTC/RUB ÷ золото (₽/г) = граммы золота за 1 BTC.
 * Числитель — рубли, знаменатель — рубли за грамм → граммы.
 */
function computeBtcgold(q: Readonly<Record<string, Quote>>): number | null {
  const btc = q['btc']?.value;
  const usdrub = q['usdrub']?.value;
  const gold = q['gold']?.value;
  if (btc == null || usdrub == null || gold == null) return null;
  return (btc * usdrub) / gold;
}

/** BTC в нефти = BTC ($) ÷ Brent ($/баррель) = баррелей за 1 BTC */
function computeBtcoil(q: Readonly<Record<string, Quote>>): number | null {
  const btc = q['btc']?.value;
  const brent = q['brent']?.value;
  if (btc == null || brent == null) return null;
  return btc / brent;
}

/**
 * Индекс завтрака — равновесный индекс из кофе, сока, пшеницы и сахара.
 *
 * Проблема: у компонент разные единицы и масштабы ($/фунт, $/центнер).
 * Решение: нормализуем каждый к фиксированной опорной точке (типичному
 * уровню цен на момент T04), усредняем и масштабируем к базе 100.
 *
 *   index = mean(component / REFERENCE) × 100
 *
 * Константы ниже — «снимок» реальных уровней на 2026-07, зафиксированный
 * в конфиге, а не в БД, потому что это эталон для индекса, а не данные.
 * Индекс показывает относительное движение корзины: 100 = всё по референсу,
 * 110 = корзина подорожала на 10 % от референса.
 */
export const BREAKFAST_REFERENCES: Readonly<Record<string, number>> = {
  coffee: 350, // $/фунт (arabica, типичный диапазон 300–400)
  oj: 300, // $/фунт (концентрат апельсинового сока)
  wheat: 6.5, // $/центнер (≈ $6.50/бушель ÷ 0.3674 ≈ $17.7/центнер — но MOEX W4 в $/центнер, типично 6–7)
  sugar: 20, // $/фунт (сырец №11, типичный диапазон 15–25 ¢/фунт)
} as const;

const BREAKFAST_BASE = 100;

function computeBreakfast(q: Readonly<Record<string, Quote>>): number | null {
  const parts: number[] = [];
  for (const id of ['coffee', 'oj', 'wheat', 'sugar'] as const) {
    const v = q[id]?.value;
    if (v == null) return null;
    const ref = BREAKFAST_REFERENCES[id];
    parts.push(v / ref);
  }
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  return mean * BREAKFAST_BASE;
}

/**
 * ₽ в золоте = 1 ÷ золото (₽/г) × 1000 = миллиграммы золота за 1 ₽.
 * 1 ₽ покупает 1/gold граммов → ×1000 миллиграммов.
 */
function computeRublgold(q: Readonly<Record<string, Quote>>): number | null {
  const gold = q['gold']?.value;
  if (gold == null) return null;
  return (1 / gold) * 1000;
}

// ── Реестр производных ────────────────────────────────────────────────────

export const DERIVED_DEFS: readonly DerivedDef[] = [
  {
    instrument: instrumentById('eurusd')!,
    inputs: ['eurrub', 'usdrub'],
    compute: computeEurusd,
  },
  {
    instrument: instrumentById('btcrub')!,
    inputs: ['btc', 'usdrub'],
    compute: computeBtcrub,
  },
  {
    instrument: instrumentById('btcgold')!,
    inputs: ['btc', 'usdrub', 'gold'],
    compute: computeBtcgold,
  },
  {
    instrument: instrumentById('btcoil')!,
    inputs: ['btc', 'brent'],
    compute: computeBtcoil,
  },
  {
    instrument: instrumentById('breakfast')!,
    inputs: ['coffee', 'oj', 'wheat', 'sugar'],
    compute: computeBreakfast,
  },
  {
    instrument: instrumentById('rublgold')!,
    inputs: ['gold'],
    compute: computeRublgold,
  },
] as const;

// ── Статус производной ────────────────────────────────────────────────────

/**
 * Правило статуса производной: статус вычисляется через тот же deriveStatus,
 * что и для живых котировок, но с «наихудшим» (наименее свежим) systime среди
 * входов и рынком производного инструмента.
 *
 * Так производная честно отражает состояние своих компонентов:
 * если хоть один вход устарел (stale) или рынок закрыт (closed), это видно.
 * unavailable обрабатывается отдельно — до вызова этой функции.
 */
export function deriveDerivedStatus(args: {
  inputs: readonly (Quote | undefined)[];
  market: Instrument['market'];
  now: Date;
}): QuoteStatus {
  const { inputs, market, now } = args;
  // наименее свежий systime = самый старый из входов
  let worstSystime: Date | null = null;
  for (const q of inputs) {
    const s = q?.systime ?? null;
    if (s === null) {
      worstSystime = null; // нет systime → считаем хуже любого
      break;
    }
    if (worstSystime === null || s.getTime() < worstSystime.getTime()) {
      worstSystime = s;
    }
  }
  return deriveStatus({ value: 1, systime: worstSystime, market, now });
}

// ── Сборка производной котировки ──────────────────────────────────────────

export function buildDerivedQuote(
  def: DerivedDef,
  quotes: Readonly<Record<string, Quote>>,
  now: Date,
): Quote {
  const id = def.instrument.id;
  const inputs = def.inputs.map((i) => quotes[i]);

  // Честность: любой вход unavailable → производная unavailable (не 0)
  for (const q of inputs) {
    if (!q || q.value === null || q.status === 'unavailable') {
      return unavailableQuote(id);
    }
  }

  const value = def.compute(quotes);
  if (value === null) {
    return unavailableQuote(id);
  }

  const status = deriveDerivedStatus({ inputs, market: def.instrument.market, now });
  return {
    instrumentId: id,
    value,
    time: null,
    systime: null,
    source: 'moex', // производная — не из коннектора; ставим moex как нейтральный источник
    status,
  };
}
