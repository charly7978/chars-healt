
export interface PPGDataPoint {
  value: number;
  timestamp: number;
  isPeak?: boolean;
  auxData?: {
    [key: string]: any;
  };
}

export class CircularBuffer<T> {
  private buffer: T[];
  private maxSize: number;
  private currentIndex: number = 0;
  private isFull: boolean = false;

  constructor(maxSize: number) {
    this.buffer = new Array<T>(maxSize);
    this.maxSize = maxSize;
  }

  /**
   * Add a new item to the buffer
   */
  push(item: T): void {
    this.buffer[this.currentIndex] = item;
    this.currentIndex = (this.currentIndex + 1) % this.maxSize;

    if (!this.isFull && this.currentIndex === 0) {
      this.isFull = true;
    }
  }

  /**
   * Get all items in the buffer in chronological order
   */
  getAll(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }

    // When buffer is full, need to reorder items so that oldest is first
    return [
      ...this.buffer.slice(this.currentIndex),
      ...this.buffer.slice(0, this.currentIndex)
    ];
  }

  /**
   * Get the most recent items, up to a specified count
   */
  getRecent(count: number): T[] {
    const allItems = this.getAll();
    return allItems.slice(Math.max(0, allItems.length - count));
  }

  /**
   * Get the size of the buffer
   */
  size(): number {
    return this.isFull ? this.maxSize : this.currentIndex;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array<T>(this.maxSize);
    this.currentIndex = 0;
    this.isFull = false;
  }
}
