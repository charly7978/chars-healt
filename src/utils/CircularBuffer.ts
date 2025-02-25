
export interface PPGDataPoint {
  value: number;
  quality: number;
  timestamp: number;
}

export class CircularBuffer<T> {
  private buffer: T[];
  private size: number;
  private currentIndex: number = 0;
  private isFull: boolean = false;

  constructor(size: number) {
    this.size = size;
    this.buffer = new Array<T>(size);
  }

  push(item: T): void {
    this.buffer[this.currentIndex] = item;
    this.currentIndex = (this.currentIndex + 1) % this.size;
    if (this.currentIndex === 0) {
      this.isFull = true;
    }
  }

  getPoints(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }
    const points = [...this.buffer.slice(this.currentIndex), ...this.buffer.slice(0, this.currentIndex)];
    return points;
  }
}
