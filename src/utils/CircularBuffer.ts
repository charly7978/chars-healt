
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;

  constructor(size: number) {
    this.buffer = [];
    this.maxSize = size || 1000;
  }

  push(point: PPGDataPoint): void {
    if (!this.buffer) {
      this.buffer = [];
    }
    this.buffer.push(point);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getPoints(): PPGDataPoint[] {
    if (!this.buffer) {
      this.buffer = [];
    }
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }
}
