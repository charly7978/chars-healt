/**
 * Enhanced circular buffer for biomedical signal processing
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */

export interface PPGDataPoint {
  time: number;
  value: number;
  isArrhythmia?: boolean;
  quality?: number;
  isPeak?: boolean;
  metrics?: {
    perfusionIndex?: number;
    snr?: number;
    motionScore?: number;
  };
}

export class AdvancedCircularBuffer {
  private buffer: PPGDataPoint[];
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private channelBuffers: Map<string, number[]> = new Map();
  
  constructor(capacity: number) {
    this.capacity = Math.max(10, capacity);
    this.buffer = new Array(this.capacity);
    
    // Initialize channel buffers for multi-channel data
    this.channelBuffers.set('red', []);
    this.channelBuffers.set('ir', []);
    this.channelBuffers.set('green', []);
  }
  
  /**
   * Add a data point to the buffer
   */
  push(point: PPGDataPoint): void {
    if (this.size === this.capacity) {
      // Remove oldest point
      this.head = (this.head + 1) % this.capacity;
      this.size--;
    }
    
    // Add new point at tail
    this.buffer[this.tail] = point;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
  }
  
  /**
   * Add a value to a specific channel buffer
   */
  pushToChannel(channel: string, value: number): void {
    if (!this.channelBuffers.has(channel)) {
      this.channelBuffers.set(channel, []);
    }
    
    const buffer = this.channelBuffers.get(channel)!;
    
    buffer.push(value);
    
    // Keep channel buffer size limited
    if (buffer.length > this.capacity) {
      buffer.shift();
    }
  }
  
  /**
   * Get all points currently in the buffer
   */
  getPoints(): PPGDataPoint[] {
    const result: PPGDataPoint[] = [];
    
    if (this.size === 0) return result;
    
    let current = this.head;
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.capacity;
    }
    
    return result;
  }
  
  /**
   * Get a specific channel's data
   */
  getChannelData(channel: string): number[] {
    if (!this.channelBuffers.has(channel)) {
      return [];
    }
    
    return [...this.channelBuffers.get(channel)!];
  }
  
  /**
   * Get a time windowed subset of data points
   */
  getTimeWindow(milliseconds: number): PPGDataPoint[] {
    const now = Date.now();
    return this.getPoints().filter(point => now - point.time <= milliseconds);
  }
  
  /**
   * Find peaks in the current buffer data
   */
  findPeaks(minDistance: number = 5, prominence: number = 0.3): PPGDataPoint[] {
    const points = this.getPoints();
    if (points.length < 3) return [];
    
    const peaks: PPGDataPoint[] = [];
    let lastPeakIndex = -minDistance;
    
    for (let i = 1; i < points.length - 1; i++) {
      // Check if point is a local maximum
      if (points[i].value > points[i-1].value && 
          points[i].value > points[i+1].value) {
        
        // Ensure minimum distance from previous peak
        if (i - lastPeakIndex >= minDistance) {
          // Check prominence (height above neighboring valleys)
          let leftMin = points[i].value;
          for (let j = i - 1; j >= Math.max(0, i - minDistance); j--) {
            leftMin = Math.min(leftMin, points[j].value);
          }
          
          let rightMin = points[i].value;
          for (let j = i + 1; j < Math.min(points.length, i + minDistance); j++) {
            rightMin = Math.min(rightMin, points[j].value);
          }
          
          const peakProminence = Math.min(
            points[i].value - leftMin,
            points[i].value - rightMin
          );
          
          if (peakProminence >= prominence) {
            peaks.push(points[i]);
            lastPeakIndex = i;
          }
        }
      }
    }
    
    return peaks;
  }
  
  /**
   * Calculate signal statistics
   */
  getSignalStats(): {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    peakCount: number;
  } {
    const points = this.getPoints();
    if (points.length === 0) {
      return { mean: 0, min: 0, max: 0, stdDev: 0, peakCount: 0 };
    }
    
    const values = points.map(p => p.value);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Calculate standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Count peaks
    const peakCount = this.findPeaks().length;
    
    return { mean, min, max, stdDev, peakCount };
  }
  
  /**
   * Clear all data
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    
    // Clear all channel buffers
    for (const key of this.channelBuffers.keys()) {
      this.channelBuffers.set(key, []);
    }
  }
  
  /**
   * Calculate heart rate from peaks
   */
  calculateHeartRate(timeWindow: number = 10000): number {
    const recentPoints = this.getTimeWindow(timeWindow);
    if (recentPoints.length < 5) return 0;
    
    // Find peaks in the time window
    const peaks = this.findPeaks();
    if (peaks.length < 2) return 0;
    
    // Sort peaks by time
    peaks.sort((a, b) => a.time - b.time);
    
    // Calculate intervals between peaks in milliseconds
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i].time - peaks[i-1].time);
    }
    
    // Filter out very short or long intervals
    const validIntervals = intervals.filter(interval => 
      interval >= 300 && interval <= 1500 // 40-200 bpm range
    );
    
    if (validIntervals.length === 0) return 0;
    
    // Calculate average interval
    const avgInterval = validIntervals.reduce((sum, interval) => sum + interval, 0) / validIntervals.length;
    
    // Convert to BPM
    return Math.round(60000 / avgInterval);
  }
}
