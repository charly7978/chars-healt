
/**
 * PPG Data Point interface representing a single point in the PPG signal
 */
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

/**
 * Circular Buffer implementation for efficiently storing and managing PPG signal data
 */
export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;

  /**
   * Creates a new CircularBuffer with the specified capacity
   * @param capacity Maximum number of data points the buffer can hold
   */
  constructor(capacity: number) {
    this.buffer = new Array<PPGDataPoint>(capacity);
    this.capacity = capacity;
  }

  /**
   * Adds a new data point to the buffer
   * @param point The PPG data point to add
   */
  push(point: PPGDataPoint): void {
    this.buffer[this.tail] = point;
    
    if (this.size === this.capacity) {
      // Buffer is full, move head
      this.head = (this.head + 1) % this.capacity;
    } else {
      // Buffer not full yet, increase size
      this.size++;
    }
    
    // Update tail position for next insertion
    this.tail = (this.tail + 1) % this.capacity;
  }

  /**
   * Gets all data points in the buffer in chronological order
   * @returns Array of data points
   */
  getPoints(): PPGDataPoint[] {
    const result: PPGDataPoint[] = [];
    
    if (this.size === 0) {
      return result;
    }
    
    // Start from head and collect all points in order
    let current = this.head;
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.capacity;
    }
    
    // Sort by time to ensure chronological order
    return result.sort((a, b) => a.time - b.time);
  }

  /**
   * Clears all data from the buffer
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  /**
   * Gets the current number of data points in the buffer
   * @returns Number of data points
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Gets the maximum capacity of the buffer
   * @returns Maximum capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Gets latest data points up to the specified count
   * @param count Maximum number of recent points to return
   * @returns Array of the most recent data points
   */
  getLatestPoints(count: number): PPGDataPoint[] {
    const allPoints = this.getPoints();
    return allPoints.slice(Math.max(0, allPoints.length - count));
  }
}
