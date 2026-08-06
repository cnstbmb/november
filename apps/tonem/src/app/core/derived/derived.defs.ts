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

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// ── Формулы ───────────────────────────────────────────────────────────────

/** EUR/USD = EUR/RUB ÷ USD/RUB (кросс через рубль) */
function computeEurusd(q: Readonly<Record<string, Quote>>): number | null {
  const eurrub = q['eurrub']?.value;
  const usdrub = q['usdrub']?.value;
  if (!positive(eurrub) || !positive(usdrub)) return null;
  return eurrub / usdrub;
}

/** BTC/RUB = BTC ($) × USD/RUB */
function computeBtcrub(q: Readonly<Record<string, Quote>>): number | null {
  const btc = q['btc']?.value;
  const usdrub = q['usdrub']?.value;
  if (!positive(btc) || !positive(usdrub)) return null;
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
  if (!positive(btc) || !positive(usdrub) || !positive(gold)) return null;
  return (btc * usdrub) / gold;
}

/** BTC в нефти = BTC ($) ÷ Brent ($/баррель) = баррелей за 1 BTC */
function computeBtcoil(q: Readonly<Record<string, Quote>>): number | null {
  const btc = q['btc']?.value;
  const brent = q['brent']?.value;
  if (!positive(btc) || !positive(brent)) return null;
  return btc / brent;
}

/**
 * Индекс завтрака — равновесный индекс из кофе, сока, пшеницы и сахара.
 *
 * У компонентов разные единицы и масштабы ($/фунт и ₽/тонна).
 * Решение: нормализуем каждый к расчётной цене на фиксированную дату,
 * усредняем и масштабируем к базе 100.
 *
 *   index = mean(component / REFERENCE) × 100
 *
 * Константы ниже — расчётные цены ближайших контрактов MOEX на 2026-07-28,
 * зафиксированные в конфиге, потому что это база индекса, а не live-данные.
 * Индекс показывает относительное движение корзины: 100 = всё по референсу,
 * 110 = корзина подорожала на 10 % от референса.
 */
export const BREAKFAST_REFERENCES: Readonly<Record<string, number>> = {
  coffee: 3.383, // KCQ6, $/фунт
  oj: 1.44, // OJU6, $/фунт
  wheat: 16_810, // W4Q6, ₽/тонна
  sugar: 63_000, // SuQ6, ₽/тонна
} as const;

const BREAKFAST_BASE = 100;

function computeBreakfast(q: Readonly<Record<string, Quote>>): number | null {
  const parts: number[] = [];
  for (const id of ['coffee', 'oj', 'wheat', 'sugar'] as const) {
    const v = q[id]?.value;
    if (!positive(v)) return null;
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
  if (!positive(gold)) return null;
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
 * Закрытый или устаревший базовый рынок наследуется производной напрямую.
 * Для полностью живого или исторического набора дополнительно проверяем
 * торговое окно самой производной и самый старый systime.
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
  const statuses = inputs.map((quote) => quote?.status).filter(Boolean);
  if (statuses.includes('closed')) return 'closed';
  if (statuses.includes('stale')) return 'stale';
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
  if (value === null || !Number.isFinite(value) || value <= 0) {
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
