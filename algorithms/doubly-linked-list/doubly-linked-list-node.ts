export class DoublyLinkedListNode {
  constructor(
    public value: any,
    public next: any | null = null,
    public previous: any | null = null
  ) {}

  toString(callback?: (value: any) => string): string {
    return callback ? callback(this.value) : `${this.value}`;
  }
}
