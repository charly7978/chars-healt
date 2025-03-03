
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

  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
    this.medianCache = new Array(5).fill(0);
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
    // Skip every third frame to reduce processing load
    this.frameSkipCounter = (this.frameSkipCounter + 1) % 3;
    if (this.frameSkipCounter !== 0) return;
    
    if (value < 90 || value > 100) return; // Prevent physiologically impossible values
    
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
    // Apply median filter to eliminate outliers (use a faster implementation)
    let filteredSpO2 = calibratedSpO2;
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
      
      // Remove extremes - get the middle values (trimmed mean)
      // Calculate average of middle 3 values (indices 1, 2, 3)
      const sum = valuesToProcess[1] + valuesToProcess[2] + valuesToProcess[3];
      const avg = Math.round(sum / 3);
      
      // Apply exponential smoothing with previous value to prevent abrupt changes
      if (this.lastSpo2Value > 0) {
        filteredSpO2 = Math.round(
          SPO2_CONSTANTS.MOVING_AVERAGE_ALPHA * avg + 
          (1 - SPO2_CONSTANTS.MOVING_AVERAGE_ALPHA) * this.lastSpo2Value
        );
      } else {
        filteredSpO2 = avg;
      }
    }
    
    // Ensure the value is in physiologically possible range (using Math.max/min is faster than conditionals)
    filteredSpO2 = Math.max(90, Math.min(99, filteredSpO2));
    
    // Update the last valid value
    this.lastSpo2Value = filteredSpO2;
    
    return filteredSpO2;
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
