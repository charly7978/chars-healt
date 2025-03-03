/**
 * Optimized circular buffer for PPG data points
 * Uses pre-allocated arrays and optimized operations for smooth rendering
 */
interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia: boolean;
}

export class CircularBuffer {
  private buffer: PPGDataPoint[];
  private maxSize: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;
  private lastPushTime: number = 0;
  private stableInterval: number = 16; // Target 60fps

  constructor(size: number) {
    // Pre-allocate the entire buffer for better memory management
    this.buffer = new Array(size);
    this.maxSize = size;
    this.lastPushTime = performance.now();
  }

  /**
   * Add a point to the buffer with frame rate control for smoothness
   */
  push(point: PPGDataPoint): void {
    // Apply adaptive frame rate control based on system performance
    const now = performance.now();
    const elapsed = now - this.lastPushTime;
    
    // Skip frames if system is running too fast to maintain consistent rendering
    if (elapsed < this.stableInterval / 2) {
      return;
    }
    
    // Adapt interval based on actual performance for consistency
    if (elapsed < this.stableInterval) {
      this.stableInterval = 0.8 * this.stableInterval + 0.2 * elapsed;
    }
    
    this.lastPushTime = now;
    
    // O(1) circular buffer implementation - no array shifts
    this.buffer[this.tail] = point;
    this.tail = (this.tail + 1) % this.maxSize;
    
    if (this.count < this.maxSize) {
      this.count++;
    } else {
      // Move head pointer when buffer is full
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  /**
   * Get all points in correct order with optimized memory usage
   */
  getPoints(): PPGDataPoint[] {
    // Avoid unnecessary array creation if buffer is empty
    if (this.count === 0) {
      return [];
    }
    
    // Preallocate result array for better performance
    const result = new Array(this.count);
    
    // Copy elements in correct order with circular wrapping
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.maxSize;
      result[i] = this.buffer[index];
    }
    
    return result;
  }

  /**
   * Clear the buffer and reset state
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    // Keep the pre-allocated array but reset count
  }
  
  /**
   * Get the most recent points within a time window for efficient rendering
   */
  getPointsInTimeWindow(windowMs: number, currentTime: number): PPGDataPoint[] {
    // Early return for empty buffer
    if (this.count === 0) {
      return [];
    }
    
    // Calculate how many points to include based on time window
    const cutoffTime = currentTime - windowMs;
    let validPoints = 0;
    
    // Count how many points are within the time window - scan from newest to oldest
    for (let i = this.count - 1; i >= 0; i--) {
      const index = (this.head + i) % this.maxSize;
      if (this.buffer[index] && this.buffer[index].time >= cutoffTime) {
        validPoints = i + 1;
        break;
      }
    }
    
    // Optimize for case where all points are valid
    if (validPoints === 0 && this.count > 0) {
      validPoints = this.count;
    }
    
    // Preallocate result array for better memory performance
    const result = new Array(validPoints);
    
    // Copy only the points within the time window
    for (let i = 0; i < validPoints; i++) {
      const index = (this.head + i) % this.maxSize;
      result[i] = this.buffer[index];
    }
    
    return result;
  }
}

export type { PPGDataPoint };
