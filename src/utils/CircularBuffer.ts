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
    // Keep only the most recent 30% of data points to maintain continuity
    const pointsToKeep = Math.max(Math.floor(this.buffer.length * 0.3), 0);
    if (pointsToKeep > 0) {
      this.buffer = this.buffer.slice(-pointsToKeep);
    } else {
      this.buffer = [];
    }
    console.log(`CircularBuffer: Cleared buffer, keeping ${pointsToKeep} recent points`);
  }

  getBuffer() {
    return this.buffer;
  }
}
