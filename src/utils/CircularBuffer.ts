
/**
 * PPG Data Point interface representing a single point in the PPG signal
 */
export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

/**
 * Optimized Circular Buffer implementation for efficiently storing and managing PPG signal data
 */
export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private lastFingerDetection: number = 0;

  /**
   * Creates a new CircularBuffer with the specified capacity
   * @param capacity Maximum number of data points the buffer can hold
   */
  constructor(capacity: number) {
    this.buffer = new Array<PPGDataPoint>(capacity);
    this.capacity = capacity;
  }

  /**
   * Adds a new data point to the buffer - Optimized for performance
   * @param point The PPG data point to add
   */
  push(point: PPGDataPoint): void {
    // Fast insertion without unnecessary operations
    this.buffer[this.tail] = point;
    
    if (this.size === this.capacity) {
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.size++;
    }
    
    this.tail = (this.tail + 1) % this.capacity;
    
    // Update finger detection timestamp if signal is strong
    if (Math.abs(point.value) > 0.1) {
      this.lastFingerDetection = Date.now();
    }
  }

  /**
   * Gets all data points in the buffer in chronological order
   * @returns Array of data points
   */
  getPoints(): PPGDataPoint[] {
    if (this.size === 0) return [];
    
    const result = new Array<PPGDataPoint>(this.size);
    let current = this.head;
    
    // Direct array assignment instead of pushing (faster)
    for (let i = 0; i < this.size; i++) {
      result[i] = this.buffer[current];
      current = (current + 1) % this.capacity;
    }
    
    return result;
  }

  /**
   * Checks if a finger is currently detected based on signal characteristics
   * Simplified for better performance
   */
  isFingerDetected(): boolean {
    // Simple time-based persistence (60 seconds)
    const timeSinceLastDetection = Date.now() - this.lastFingerDetection;
    if (timeSinceLastDetection < 60000) return true;
    
    if (this.size < 5) return false;
    
    // Simplified detection based on recent values
    const recentPoints = this.getLatestPoints(10);
    let hasSignificantValue = false;
    
    for (const point of recentPoints) {
      if (Math.abs(point.value) > 0.1) {
        hasSignificantValue = true;
        break;
      }
    }
    
    if (hasSignificantValue) {
      this.lastFingerDetection = Date.now();
      return true;
    }
    
    return false;
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
   * Gets latest data points up to the specified count - Optimized
   * @param count Maximum number of recent points to return
   * @returns Array of the most recent data points
   */
  getLatestPoints(count: number): PPGDataPoint[] {
    if (this.size === 0) return [];
    
    const resultCount = Math.min(count, this.size);
    const result = new Array<PPGDataPoint>(resultCount);
    
    // Calculate starting point
    let startPosition = (this.tail - resultCount + this.capacity) % this.capacity;
    
    // Direct array copy for performance
    for (let i = 0; i < resultCount; i++) {
      result[i] = this.buffer[(startPosition + i) % this.capacity];
    }
    
    return result;
  }
}
