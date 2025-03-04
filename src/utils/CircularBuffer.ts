export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
  isWaveStart: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private size: number;
  private currentIndex: number;
  private isFull: boolean;

  constructor(size: number) {
    this.buffer = new Array(size);
    this.size = size;
    this.currentIndex = 0;
    this.isFull = false;
  }

  push(point: PPGDataPoint) {
    this.buffer[this.currentIndex] = point;
    this.currentIndex = (this.currentIndex + 1) % this.size;
    if (this.currentIndex === 0) {
      this.isFull = true;
    }
  }

  getPoints(): PPGDataPoint[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.currentIndex);
    }
    
    const points = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      points[i] = this.buffer[(this.currentIndex + i) % this.size];
    }
    return points.filter(point => point !== undefined);
  }

  clear() {
    this.buffer = new Array(this.size);
    this.currentIndex = 0;
    this.isFull = false;
  }
}
