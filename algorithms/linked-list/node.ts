export default class LinkedListNode<Value = any> {
    public value: Value;
    public next: Value | null = null;

    constructor(value: Value, next: Value | null = null) {
      this.value = value;
      this.next = next;
    }
  
    public toString(callback: (value: Value) => string) {
      return callback ? callback(this.value) : `${this.value}`;
    }
  }