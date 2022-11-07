export default class LinkedListNode<Value = any> {
    value: Value;
    next: Value | null = null;

    constructor(value: Value, next: Value | null = null) {
      this.value = value;
      this.next = next;
    }
  
    toString(callback?: (value: Value) => string) {
      return callback ? callback(this.value) : `${this.value}`;
    }
  }