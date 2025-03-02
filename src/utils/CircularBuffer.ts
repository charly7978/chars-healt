
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia?: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private size: number;
  private currentIndex: number;
  private isFull: boolean;

  constructor(size: number) {
    this.buffer = [];
    this.size = size;
    this.currentIndex = 0;
    this.isFull = false;
  }

  push(item: PPGDataPoint): void {
    if (this.buffer.length < this.size) {
      this.buffer.push(item);
    } else {
      this.buffer[this.currentIndex] = item;
      this.isFull = true;
    }

    this.currentIndex = (this.currentIndex + 1) % this.size;
  }

  getPoints(): PPGDataPoint[] {
    if (!this.isFull) {
      return [...this.buffer];
    }

    const result = [];
    for (let i = this.currentIndex; i < this.size; i++) {
      result.push(this.buffer[i]);
    }
    for (let i = 0; i < this.currentIndex; i++) {
      result.push(this.buffer[i]);
    }

    return result;
  }

  // Added method to clear the buffer
  clear(): void {
    this.buffer = [];
    this.currentIndex = 0;
    this.isFull = false;
  }
}
