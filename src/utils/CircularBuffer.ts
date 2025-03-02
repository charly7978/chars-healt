
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[] = [];
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(data: PPGDataPoint) {
    this.buffer.push(data);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  getPoints(): PPGDataPoint[] {
    return [...this.buffer];
  }

  clear() {
    this.buffer = [];
  }

  getBuffer() {
    return this.buffer;
  }
}
