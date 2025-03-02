interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size;
  }

  push(point: PPGDataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getPoints(): PPGDataPoint[] {
    return [...this.buffer];
  }

  clear(): void {
    const keepCount = Math.max(Math.floor(this.buffer.length * 0.3), 10);
    if (this.buffer.length > keepCount) {
      this.buffer = this.buffer.slice(-keepCount);
    }
  }
}

export type { PPGDataPoint };
