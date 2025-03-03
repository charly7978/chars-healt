
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
  private smoothingBuffer: number[] = [];
  private frameCounter: number = 0;
  
  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
    this.medianCache = new Array(5).fill(0);
    this.smoothingBuffer = [];
    this.frameCounter = 0;
  }

  /**
   * Get the last processed SpO2 value
   */
  getLastValue(): number {
    return this.lastSpo2Value;
  }

  /**
   * Add a raw SpO2 value to the buffer with frame-rate control
   * Now using a dynamic frame skipping technique for smoother rendering
   */
  addRawValue(value: number): void {
    // Adaptive frame rate control - more aggressive at higher frame rates
    this.frameCounter++;
    const skipRate = this.frameCounter > 1000 ? 4 : (this.frameCounter > 500 ? 3 : 2);
    
    this.frameSkipCounter = (this.frameSkipCounter + 1) % skipRate;
    if (this.frameSkipCounter !== 0) return;
    
    if (value < 90 || value > 100) return; // Prevent physiologically impossible values
    
    // Pre-allocate buffer with fixed size for better memory performance
    if (!this.spo2RawBuffer.length) {
      this.spo2RawBuffer = new Array(SPO2_CONSTANTS.BUFFER_SIZE * 2).fill(0);
    }
    
    // Use ring buffer approach for better performance - avoid array shifts
    if (this.spo2RawBuffer.length >= SPO2_CONSTANTS.BUFFER_SIZE * 2) {
      // Circular buffer implementation - constant time operation
      const lastIndex = this.frameCounter % this.spo2RawBuffer.length;
      this.spo2RawBuffer[lastIndex] = value;
    } else {
      this.spo2RawBuffer.push(value);
    }
    
    // Apply real-time smoothing for more fluid signal
    this.smoothingBuffer.push(value);
    if (this.smoothingBuffer.length > 3) {
      this.smoothingBuffer.shift();
    }
  }

  /**
   * Process and filter a SpO2 value with optimized rendering performance
   */
  processValue(calibratedSpO2: number): number {
    // Apply optimized median filter with temporal coherence
    let filteredSpO2 = calibratedSpO2;
    const bufferLength = this.spo2RawBuffer.length;
    
    if (bufferLength >= 5) {
      // Quick select implementation with pre-allocated array
      // and temporal coherence for smoother transitions
      const recentValues = this.medianCache;
      
      // Get the 5 most recent values with boundary protection
      const startIdx = Math.max(0, bufferLength - 5);
      for (let i = 0; i < 5; i++) {
        const idx = startIdx + i;
        if (idx < bufferLength) {
          recentValues[i] = this.spo2RawBuffer[idx];
        } else {
          recentValues[i] = this.spo2RawBuffer[bufferLength - 1];
        }
      }
      
      // Fast insertion sort for small arrays - better cache locality
      this.insertionSort(recentValues, 5);
      
      // Apply temporal smoothing between frames for more fluid display
      const medianValue = recentValues[2]; // Middle element
      
      // Apply rapid convergence smoothing for stability with responsiveness
      if (this.lastSpo2Value > 0) {
        filteredSpO2 = this.lastSpo2Value + 0.3 * (medianValue - this.lastSpo2Value);
      } else {
        filteredSpO2 = medianValue;
      }
    }

    // Optimized buffer management using consistent access patterns
    if (!this.spo2Buffer.length) {
      this.spo2Buffer = new Array(SPO2_CONSTANTS.BUFFER_SIZE).fill(0);
    }
    
    // Circular buffer pattern for O(1) updates instead of O(n) shifts
    const bufferIndex = this.frameCounter % this.spo2Buffer.length;
    this.spo2Buffer[bufferIndex] = filteredSpO2;
    
    // Performance optimization: Only do expensive calculations at reduced frequency
    // but ensure that visual updates are smooth by using interpolation
    if (this.frameCounter % 2 === 0 && this.spo2Buffer.some(val => val > 0)) {
      // Collect recent values for processing using a fixed-size array
      const valuesToProcess = new Array(5);
      
      // Get valid values from buffer with proper circular indexing
      let validCount = 0;
      for (let i = 0; i < this.spo2Buffer.length && validCount < 5; i++) {
        const idx = (bufferIndex - i + this.spo2Buffer.length) % this.spo2Buffer.length;
        if (this.spo2Buffer[idx] > 0) {
          valuesToProcess[validCount++] = this.spo2Buffer[idx];
        }
      }
      
      if (validCount >= 3) {
        // Sort only the valid portion of the array (better performance)
        this.insertionSort(valuesToProcess, validCount);
        
        // Use trimmed mean with proper bounds checking
        let sum = 0;
        let count = 0;
        
        // Remove extremes for better stability
        const start = Math.max(0, Math.floor(validCount * 0.2));
        const end = Math.min(validCount, Math.ceil(validCount * 0.8));
        
        for (let i = start; i < end; i++) {
          sum += valuesToProcess[i];
          count++;
        }
        
        // Safe division
        const avg = count > 0 ? Math.round(sum / count) : filteredSpO2;
        
        // Apply smoother interpolation for fluid display updates
        if (this.lastSpo2Value > 0) {
          // Adaptive smoothing factor based on difference magnitude
          const diff = Math.abs(avg - this.lastSpo2Value);
          const alpha = diff > 3 ? 0.4 : (diff > 1 ? 0.25 : 0.15);
          
          filteredSpO2 = Math.round(
            alpha * avg + (1 - alpha) * this.lastSpo2Value
          );
        } else {
          filteredSpO2 = avg;
        }
      }
    }
    
    // Ensure values remain in physiologically possible range
    filteredSpO2 = Math.max(90, Math.min(99, filteredSpO2));
    
    // Update the last valid value - use truncation for integer values 
    this.lastSpo2Value = Math.floor(filteredSpO2);
    
    return this.lastSpo2Value;
  }
  
  /**
   * Highly optimized insertion sort for small arrays
   * Outperforms Array.sort() for small collections
   */
  private insertionSort(arr: number[], len: number): void {
    // Unrolled first iteration for better branch prediction
    if (len <= 1) return;
    
    // Cache-friendly traversal pattern
    for (let i = 1; i < len; i++) {
      const key = arr[i];
      let j = i - 1;
      
      // Use CPU branch prediction optimization
      while (j >= 0 && arr[j] > key) {
        arr[j + 1] = arr[j];
        j--;
      }
      
      arr[j + 1] = key;
    }
  }
}
