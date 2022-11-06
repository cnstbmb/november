export type CompareElement = string | number;
export type CompareResult = -1 | 0 | 1;
export type CompareFunction = (
  a: CompareElement,
  b: CompareElement
) => CompareResult;

export class Comparator {
  private compare: CompareFunction;

  constructor(readonly compareFunc?: CompareFunction) {
    this.compare = compareFunc || Comparator.defaultCompareFunction;
  }

  static defaultCompareFunction(
    a: CompareElement,
    b: CompareElement
  ): CompareResult {
    if (a === b) {
      return 0;
    }

    return a < b ? -1 : 1;
  }

  public equal(a: CompareElement, b: CompareElement): boolean {
    return this.compare(a, b) === 0;
  }

  public lessThan(a: CompareElement, b: CompareElement): boolean {
    return this.compare(a, b) < 0;
  }

  public greaterThan(a: CompareElement, b: CompareElement): boolean {
    return this.compare(a, b) > 0;
  }

  public lessThanOrEqual(a: CompareElement, b: CompareElement): boolean {
    return this.lessThan(a, b) || this.equal(a, b);
  }

  public greaterThanOrEqual(a: CompareElement, b: CompareElement): boolean {
    return this.greaterThan(a, b) || this.equal(a, b);
  }

  public reverse() {
    const compareOriginal = this.compare;
    this.compare = (a, b) => compareOriginal(b, a);
  }
}
