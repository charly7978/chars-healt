
/**
 * Handles SpO2 signal processing and filtering
 */
import { SPO2_CONSTANTS } from './SpO2Constants';

export class SpO2Processor {
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private lastSpo2Value: number = 0;
  private frameSkipCounter: number = 0;
  private medianCache: number[] = new Array(5).fill(0);
  private renderQualityMode: boolean = true; // Always enable high quality rendering
  private stabilityBuffer: number[] = []; // Buffer to stabilize readings
  private historyBuffer: number[] = []; // Extended history buffer for pattern recognition
  private anomalyThreshold: number = 3.0; // Z-score threshold for anomaly detection

  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
    this.medianCache = new Array(5).fill(0);
    this.stabilityBuffer = [];
    this.historyBuffer = [];
  }

  /**
   * Get the last processed SpO2 value
   */
  getLastValue(): number {
    return this.lastSpo2Value;
  }

  /**
   * Add a raw SpO2 value to the buffer
   */
  addRawValue(value: number): void {
    // Minimal frame skipping for extremely fluid visuals
    this.frameSkipCounter = (this.frameSkipCounter + 1) % 1; // No frame skipping
    if (this.frameSkipCounter !== 0) return;
    
    if (value < 90 || value > 100) return; // Prevent physiologically impossible values
    
    // Add to history buffer for pattern recognition
    if (this.historyBuffer.length >= 60) { // Keep last minute of data (assuming ~1Hz sampling)
      this.historyBuffer.shift();
    }
    this.historyBuffer.push(value);
    
    // Use a more efficient buffer implementation with pre-allocated space
    if (this.spo2RawBuffer.length >= SPO2_CONSTANTS.BUFFER_SIZE * 2) {
      // Shift elements manually instead of using array.shift() for better performance
      for (let i = 0; i < this.spo2RawBuffer.length - 1; i++) {
        this.spo2RawBuffer[i] = this.spo2RawBuffer[i + 1];
      }
      this.spo2RawBuffer[this.spo2RawBuffer.length - 1] = value;
    } else {
      this.spo2RawBuffer.push(value);
    }
  }

  /**
   * Process and filter a SpO2 value
   */
  processValue(calibratedSpO2: number): number {
    // Apply anomaly detection before further processing
    const isAnomaly = this.detectAnomaly(calibratedSpO2);
    let filteredSpO2 = isAnomaly ? this.lastSpo2Value || calibratedSpO2 : calibratedSpO2;
    
    // Apply median filter to eliminate outliers (use a faster implementation)
    const bufferLength = this.spo2RawBuffer.length;
    
    if (bufferLength >= 5) {
      // Use quick select for median with pre-allocated array
      const recentValues = this.medianCache;
      
      // Get the 5 most recent values
      const startIdx = Math.max(0, bufferLength - 5);
      for (let i = 0; i < 5; i++) {
        recentValues[i] = this.spo2RawBuffer[startIdx + i] || this.spo2RawBuffer[this.spo2RawBuffer.length - 1];
      }
      
      // Optimized sort for small arrays (insertion sort is faster for small arrays)
      this.insertionSort(recentValues, 5);
      filteredSpO2 = recentValues[2]; // Middle element (index 2) of 5 elements
    }

    // Optimized buffer management with pre-allocation
    if (this.spo2Buffer.length >= SPO2_CONSTANTS.BUFFER_SIZE) {
      // Manually shift elements for better performance
      for (let i = 0; i < this.spo2Buffer.length - 1; i++) {
        this.spo2Buffer[i] = this.spo2Buffer[i + 1];
      }
      this.spo2Buffer[this.spo2Buffer.length - 1] = filteredSpO2;
    } else {
      this.spo2Buffer.push(filteredSpO2);
    }

    // Performance optimization: Only do expensive calculations when we have sufficient data
    if (this.spo2Buffer.length >= 5) {
      // Use a fixed-size array for processing to avoid allocations
      const valuesToProcess = new Array(5);
      const startPos = Math.max(0, this.spo2Buffer.length - 5);
      
      for (let i = 0; i < 5; i++) {
        valuesToProcess[i] = this.spo2Buffer[startPos + i] || this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      
      // Sort in-place with optimized algorithm for small arrays
      this.insertionSort(valuesToProcess, 5);
      
      // Enhanced filtering: Use pattern-based weighting
      filteredSpO2 = this.applyPatternBasedFiltering(valuesToProcess);
      
      // Use extra strong smoothing to prevent value changes
      if (this.lastSpo2Value > 0) {
        // Adaptive alpha based on signal stability
        const signalStability = this.calculateSignalStability();
        const alpha = 0.05 + (0.2 * (1 - signalStability)); // Alpha ranges from 0.05 (stable) to 0.25 (unstable)
                      
        filteredSpO2 = Math.round(
          alpha * filteredSpO2 + 
          (1 - alpha) * this.lastSpo2Value
        );
      }
    }
    
    // Stability buffer to prevent jumping values
    if (this.stabilityBuffer.length >= 10) {
      this.stabilityBuffer.shift();
    }
    this.stabilityBuffer.push(filteredSpO2);
    
    // Use ensemble method combining mode and median from stability buffer
    if (this.stabilityBuffer.length >= 3) {
      const modeValue = this.calculateMode(this.stabilityBuffer);
      const sortedBuffer = [...this.stabilityBuffer].sort((a, b) => a - b);
      const medianValue = sortedBuffer[Math.floor(sortedBuffer.length / 2)];
      
      // Weighted average of mode (70%) and median (30%)
      filteredSpO2 = Math.round((modeValue * 0.7) + (medianValue * 0.3));
    }
    
    // Ensure the value is in physiologically possible range
    filteredSpO2 = Math.max(90, Math.min(99, filteredSpO2));
    
    // Update the last valid value (with additional smoothing for display stability)
    // Only update if the difference is significant (prevents micro-flickering)
    if (Math.abs(filteredSpO2 - this.lastSpo2Value) >= 1) {
      this.lastSpo2Value = filteredSpO2;
    }
    
    return this.lastSpo2Value; // Return the extra-stable value
  }
  
  /**
   * Calculate mode (most common value) from array
   */
  private calculateMode(arr: number[]): number {
    const frequencyMap = new Map<number, number>();
    let maxFreq = 0;
    let modeValue = arr[0];
    
    for (const value of arr) {
      const count = (frequencyMap.get(value) || 0) + 1;
      frequencyMap.set(value, count);
      
      if (count > maxFreq) {
        maxFreq = count;
        modeValue = value;
      }
    }
    
    return modeValue;
  }
  
  /**
   * Apply pattern-based filtering using temporal patterns
   */
  private applyPatternBasedFiltering(values: number[]): number {
    // Calculate trend direction and strength
    let trendStrength = 0;
    let prevVal = values[0];
    let increasingCount = 0;
    let decreasingCount = 0;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i] > prevVal) {
        increasingCount++;
      } else if (values[i] < prevVal) {
        decreasingCount++;
      }
      prevVal = values[i];
    }
    
    // Determine if there's a strong trend
    const totalComparisons = values.length - 1;
    const increasingRatio = increasingCount / totalComparisons;
    const decreasingRatio = decreasingCount / totalComparisons;
    
    const hasStrongTrend = Math.max(increasingRatio, decreasingRatio) > 0.7;
    
    if (hasStrongTrend) {
      // For strong trends, use a weighted average that emphasizes the trend direction
      if (increasingRatio > decreasingRatio) {
        // Emphasize later values
        return Math.round((values[2] * 0.3) + (values[3] * 0.3) + (values[4] * 0.4));
      } else {
        // Emphasize earlier values
        return Math.round((values[0] * 0.4) + (values[1] * 0.3) + (values[2] * 0.3));
      }
    } else {
      // For no clear trend, use trimmed mean of middle values
      return Math.round((values[1] + values[2] + values[3]) / 3);
    }
  }
  
  /**
   * Calculate signal stability as a value between 0 (unstable) and 1 (stable)
   */
  private calculateSignalStability(): number {
    if (this.historyBuffer.length < 5) return 0.5; // Default mid stability
    
    // Use recent history to assess stability
    const recentValues = this.historyBuffer.slice(-10);
    
    // Calculate mean and standard deviation
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const stdDev = Math.sqrt(
      recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length
    );
    
    // Calculate coefficient of variation (normalized std dev)
    const cv = stdDev / mean;
    
    // Convert to stability score (1 = perfectly stable, 0 = highly unstable)
    // For SpO2, even small changes can be significant, so scale appropriately
    return Math.max(0, Math.min(1, 1 - (cv * 20)));
  }
  
  /**
   * Detect anomalies using Z-score method
   */
  private detectAnomaly(value: number): boolean {
    if (this.historyBuffer.length < 10) return false; // Need enough history
    
    // Calculate mean and standard deviation of recent history
    const recentValues = this.historyBuffer.slice(-20);
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const stdDev = Math.sqrt(
      recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length
    );
    
    if (stdDev < 0.001) return false; // Avoid division by zero
    
    // Calculate Z-score (how many standard deviations away from mean)
    const zScore = Math.abs(value - mean) / stdDev;
    
    // Return true if Z-score exceeds threshold
    return zScore > this.anomalyThreshold;
  }
  
  /**
   * Optimized insertion sort for small arrays
   * Much faster than Array.sort() for arrays of size <= 10
   */
  private insertionSort(arr: number[], len: number): void {
    for (let i = 1; i < len; i++) {
      const key = arr[i];
      let j = i - 1;
      
      while (j >= 0 && arr[j] > key) {
        arr[j + 1] = arr[j];
        j--;
      }
      
      arr[j + 1] = key;
    }
  }
}

