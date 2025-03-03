
/**
 * High-resolution circular buffer for PPG data points
 * Uses pre-allocated arrays and optimized operations for medical-grade rendering
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
  private stableInterval: number = 8; // Target 120fps for medical display quality

  constructor(size: number) {
    // Pre-allocate the entire buffer with higher capacity for medical-grade resolution
    this.buffer = new Array(size);
    this.maxSize = size;
    this.lastPushTime = performance.now();
  }

  /**
   * Add a point to the buffer with enhanced frame rate control for clinical visualization
   */
  push(point: PPGDataPoint): void {
    // Apply adaptive frame rate control optimized for medical displays
    const now = performance.now();
    const elapsed = now - this.lastPushTime;
    
    // More aggressive frame capture for higher resolution visualization
    if (elapsed < this.stableInterval / 3) {
      return;
    }
    
    // Precise adaptive interval calculation for clinical-grade smoothness
    if (elapsed < this.stableInterval) {
      this.stableInterval = 0.85 * this.stableInterval + 0.15 * elapsed;
    }
    
    this.lastPushTime = now;
    
    // O(1) circular buffer implementation with zero allocation overhead
    this.buffer[this.tail] = point;
    this.tail = (this.tail + 1) % this.maxSize;
    
    if (this.count < this.maxSize) {
      this.count++;
    } else {
      // Move head pointer when buffer is full - constant time operation
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  /**
   * Get all points in correct order with zero-copy optimization where possible
   */
  getPoints(): PPGDataPoint[] {
    // Avoid unnecessary array creation if buffer is empty
    if (this.count === 0) {
      return [];
    }
    
    // Preallocate result array with exact size for better performance
    const result = new Array(this.count);
    
    // Optimized memory access pattern for cache coherency
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
   * Get the most recent points within a time window for high-resolution clinical visualization
   */
  getPointsInTimeWindow(windowMs: number, currentTime: number): PPGDataPoint[] {
    // Early return for empty buffer
    if (this.count === 0) {
      return [];
    }
    
    // Calculate how many points to include based on time window with high precision
    const cutoffTime = currentTime - windowMs;
    let validPoints = 0;
    
    // Optimized binary search-inspired approach for faster time window filtering
    let low = 0;
    let high = this.count - 1;
    
    // Find the first point within the time window
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const index = (this.head + mid) % this.maxSize;
      
      if (this.buffer[index] && this.buffer[index].time >= cutoffTime) {
        high = mid - 1;
        validPoints = mid;
      } else {
        low = mid + 1;
      }
    }
    
    // Handle edge cases with precise boundary conditions
    if (validPoints === 0 && this.count > 0) {
      const lastIndex = (this.head + this.count - 1) % this.maxSize;
      if (this.buffer[lastIndex] && this.buffer[lastIndex].time >= cutoffTime) {
        validPoints = this.count;
      }
    }
    
    // Preallocate result array with exact size for zero garbage collection
    const result = new Array(this.count - validPoints);
    
    // Copy only the points within the time window with optimized access pattern
    for (let i = validPoints; i < this.count; i++) {
      const index = (this.head + i) % this.maxSize;
      result[i - validPoints] = this.buffer[index];
    }
    
    return result;
  }
}

export type { PPGDataPoint };
