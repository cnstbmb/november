import { Comparator, CompareFunction } from "../utils/comparator";
import { DoublyLinkedListNode } from "./doubly-linked-list-node";

export class DoublyLinkedList {
  head: DoublyLinkedListNode | null = null;
  tail: DoublyLinkedListNode | null = null;

  compare: Comparator;

  constructor(comparatorFunction?: CompareFunction) {
    this.compare = new Comparator(comparatorFunction);
  }

  prepend(value: any): DoublyLinkedList {
    const newNode: DoublyLinkedListNode = new DoublyLinkedListNode(value, this.head);

    if (this.head) {
      this.head.previous = newNode;
    }
    this.head = newNode;

    if (!this.tail) {
      this.tail = newNode;
    }

    return this;
  }

  append(value: any): DoublyLinkedList {
    const newNode: DoublyLinkedListNode = new DoublyLinkedListNode(value);

    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;

      return this;
    }

    this.tail!.next = newNode;
    newNode.previous = this.tail;

    this.tail = newNode;

    return this;
  }

  delete(value: any): DoublyLinkedListNode | null {
    if (!this.head) {
        return null;
      }
  
      let deletedNode: DoublyLinkedListNode | null = null;
      let currentNode: DoublyLinkedListNode = this.head;
  
      while (currentNode) {
        if (this.compare.equal(currentNode.value, value)) {
          deletedNode = currentNode;
  
          if (deletedNode === this.head) {
            this.head = deletedNode.next;

            if (this.head) {
              this.head.previous = null;
            }
  
            if (deletedNode === this.tail) {
              this.tail = null;
            }
          } else if (deletedNode === this.tail) {
            this.tail = deletedNode.previous;
            this.tail!.next = null;
          } else {
            const previousNode: any = deletedNode.previous;
            const nextNode: any = deletedNode.next;
  
            previousNode.next = nextNode;
            nextNode.previous = previousNode;
          }
        }
  
        currentNode = currentNode.next;
      }
  
      return deletedNode;
  }

  find(value?: any, callback?: (...params: any) => any): DoublyLinkedListNode | null {
    if (!this.head) {
        return null;
      }
  
      let currentNode: DoublyLinkedListNode = this.head;
  
      while (currentNode) {
        if (callback && callback(currentNode.value)) {
          return currentNode;
        }
  
        if (value !== undefined && this.compare.equal(currentNode.value, value)) {
          return currentNode;
        }
  
        currentNode = currentNode.next;
      }
  
      return null;
  }

  deleteTail(): DoublyLinkedListNode | null {
    if (!this.tail) {
        return null;
      }
  
      if (this.head === this.tail) {
        const deletedTail: DoublyLinkedListNode = this.tail;
        this.head = null;
        this.tail = null;
  
        return deletedTail;
      }
  
      const deletedTail: DoublyLinkedListNode = this.tail;
  
      this.tail = this.tail.previous;
      this.tail!.next = null;
  
      return deletedTail;
  }

  deleteHead(): DoublyLinkedListNode | null {
    if (!this.head) {
        return null;
      }
  
      const deletedHead: DoublyLinkedListNode = this.head;
  
      if (this.head.next) {
        this.head = this.head.next;
        this.head!.previous = null;
      } else {
        this.head = null;
        this.tail = null;
      }
  
      return deletedHead;
  }

  fromArray(values: any[]): DoublyLinkedList {
    values.forEach((value) => this.append(value));

    return this;
  }

  toArray(): DoublyLinkedListNode[] {
    const nodes: DoublyLinkedListNode [] = [];

    let currentNode: DoublyLinkedListNode | null = this.head;
    while (currentNode) {
      nodes.push(currentNode);
      currentNode = currentNode.next;
    }

    return nodes;
  }

  toString(callback?: (...params: any) => any): string {
    return this.toArray().map(node => node.toString(callback)).toString();
  }

  reverse(): DoublyLinkedList {
    let currNode: DoublyLinkedListNode | null = this.head;
    let prevNode: DoublyLinkedListNode | null = null;
    let nextNode: DoublyLinkedListNode | null = null;

    while (currNode) {
      nextNode = currNode.next;
      prevNode = currNode.previous;

      currNode.next = prevNode;
      currNode.previous = nextNode;

      prevNode = currNode;
      currNode = nextNode;
    }

    this.tail = this.head;
    this.head = prevNode;

    return this;
  }
}
