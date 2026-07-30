import { Direction } from './quote-motion';

/**
 * Математика одометра: вертикальные барабаны цифр, прокрутка translateY.
 * Чистая, без DOM — компонент (shared/odometer) лишь рисует slot'ы.
 *
 * Барабан — это лента цифр 0..9, повторённая REEL_CYCLES раз, чтобы было
 * куда крутить в обе стороны через перенос разряда (9→0 и 0→9). Позиция
 * барабана — целый slot; отображаемая цифра = slot % 10. Направление
 * прокрутки задаётся общим Direction котировки (как в классическом одометре),
 * а не сравнением соседних цифр — иначе 1000→999 крутилось бы «вверх».
 */

/** Сколько раз повторяем 0..9 на ленте. 4 циклов хватает с запасом. */
export const REEL_CYCLES = 4;

/** Полная длина ленты в слотах (10 * REEL_CYCLES). */
export const REEL_LENGTH = 10 * REEL_CYCLES;

/** Стартовый цикл — середина ленты, чтобы был запас и вверх, и вниз. */
const START_CYCLE = Math.floor(REEL_CYCLES / 2);

/** Описание одной колонки отображаемой строки. */
export interface DigitRoll {
  /** индекс символа в строке (0 — левый) */
  readonly index: number;
  /** отображаемый символ */
  readonly char: string;
  /** цифра ли это (у не-цифр — разделителей — барабана нет) */
  readonly isDigit: boolean;
  /** изменилась ли цифра относительно предыдущего значения */
  readonly changed: boolean;
  /** направление прокрутки этой колонки (flat — без движения) */
  readonly direction: Direction;
  /** текущий slot барабана (для цифровых колонок) */
  readonly slot: number;
  /** позиция была возвращена в середину ленты и должна примениться без transition */
  readonly rebased: boolean;
}

/** '7' → 7; любой не-цифровой символ → null. */
export function toDigit(char: string): number | null {
  return char >= '0' && char <= '9' ? char.charCodeAt(0) - 48 : null;
}

/** Цифра в слоте ленты, устойчиво к отрицательным slot. */
export function digitAt(slot: number): number {
  return ((slot % 10) + 10) % 10;
}

/**
 * Целевой slot после прокрутки к toDigit в заданном направлении.
 * Двигаемся ровно на минимальный шаг (1..9) в сторону direction,
 * что и даёт эффект «переката» через промежуточные цифры.
 */
export function advanceSlot(currentSlot: number, toDigit: number, direction: Direction): number {
  const current = digitAt(currentSlot);
  if (direction === 'up') {
    return currentSlot + ((toDigit - current + 10) % 10);
  }
  if (direction === 'down') {
    return currentSlot - ((current - toDigit + 10) % 10);
  }
  return currentSlot;
}

/**
 * Барабаны для одной строки. Хранит текущие slot'ы между обновлениями,
 * чтобы каждая цифра продолжала крутиться с того места, где остановилась.
 * Одному компоненту — один экземпляр OdometerReel.
 */
export class OdometerReel {
  private slots: number[] = [];
  private prevText = '';

  /**
   * Пересчитать колонки под новую строку.
   * Выравнивание — по правому краю (разряды растут влево), поэтому
   * разделители тысяч/десятичная запятая остаются на месте при смене длины.
   * При direction 'flat' (в т.ч. reduced-motion) цифры ставятся мгновенно.
   */
  update(nextText: string, direction: Direction): DigitRoll[] {
    const prev = this.prevText;
    const offset = prev.length - nextText.length; // сдвиг для right-align
    const nextSlots: number[] = [];
    const rolls: DigitRoll[] = [];

    for (let i = 0; i < nextText.length; i++) {
      const char = nextText[i];
      const digit = toDigit(char);

      if (digit === null) {
        // разделитель: рендерится статично, барабана нет
        rolls.push({
          index: i,
          char,
          isDigit: false,
          changed: false,
          direction: 'flat',
          slot: 0,
          rebased: false,
        });
        nextSlots.push(0);
        continue;
      }

      const prevChar = offset + i >= 0 ? prev[offset + i] : undefined;
      const prevDigit = prevChar !== undefined ? toDigit(prevChar) : null;
      const changed = prevDigit !== digit;

      let slot = this.slots[i] ?? this.startSlot(digit);
      let rebased = false;
      if (changed && direction !== 'flat') {
        const advanced = advanceSlot(slot, digit, direction);
        if (advanced < 0 || advanced >= REEL_LENGTH) {
          // Лента конечна. Возвращаем ту же цифру в центральный цикл без
          // transition, иначе transform уйдёт за пределы DOM и разряд исчезнет.
          slot = this.startSlot(digit);
          rebased = true;
        } else {
          slot = advanced;
        }
      } else if (digitAt(slot) !== digit) {
        // рассинхрон (смена длины/формата или reduced-motion) — без анимации на цифру
        slot = this.startSlot(digit);
        rebased = true;
      }

      rolls.push({
        index: i,
        char,
        isDigit: true,
        changed,
        direction: changed ? direction : 'flat',
        slot,
        rebased,
      });
      nextSlots.push(slot);
    }

    this.slots = nextSlots;
    this.prevText = nextText;
    return rolls;
  }

  /** Slot покоя для цифры — середина ленты. */
  private startSlot(digit: number): number {
    return digit + 10 * START_CYCLE;
  }
}
