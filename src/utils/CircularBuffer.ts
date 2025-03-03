
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer<T = number> {
  private buffer: T[];
  private maxSize: number;

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
  }

  push(value: T): void {
    this.buffer.push(value);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getValues(): T[] {
    return [...this.buffer];
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

export class PPGBuffer extends CircularBuffer<PPGDataPoint> {
  constructor(size: number) {
    super(size);
  }

  // Override the getValues method with a more specific name for clarity
  getPoints(): PPGDataPoint[] {
    return this.getValues();
  }
}

export type { PPGDataPoint };
