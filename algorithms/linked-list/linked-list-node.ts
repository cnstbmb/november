export class LinkedListNode {
    constructor(public value: any, public next: any | null = null) {
    }
  
    toString(callback?: (value: any) => string) {
      return callback ? callback(this.value) : `${this.value}`;
    }
  }