
/**
 * Handles SpO2 signal processing and filtering
 */
import { SPO2_CONSTANTS } from './SpO2Constants';

export class SpO2Processor {
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private lastSpo2Value: number = 0;
  private frameSkipCounter: number = 0;

  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
    this.frameSkipCounter = 0;
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
    // Skip every other frame to reduce processing load
    this.frameSkipCounter = (this.frameSkipCounter + 1) % 2;
    if (this.frameSkipCounter !== 0) return;
    
    if (value < 90 || value > 100) return; // Prevent physiologically impossible values
    
    this.spo2RawBuffer.push(value);
    if (this.spo2RawBuffer.length > SPO2_CONSTANTS.BUFFER_SIZE * 2) {
      this.spo2RawBuffer.shift();
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
      // Use quick select for median instead of full sort for better performance
      const recentValues = [...this.spo2RawBuffer].slice(-5);
      recentValues.sort((a, b) => a - b);
      filteredSpO2 = recentValues[2]; // Middle element (index 2) of 5 elements
    }

    // Maintain buffer of values for stability (use fixed-size array for better performance)
    this.spo2Buffer.push(filteredSpO2);
    if (this.spo2Buffer.length > SPO2_CONSTANTS.BUFFER_SIZE) {
      this.spo2Buffer.shift();
    }

    // Performance optimization: Only do expensive calculations when we have sufficient data
    if (this.spo2Buffer.length >= 5) {
      // Create a copy of values we'll process to avoid modifying the original array
      const valuesToProcess = this.spo2Buffer.slice(-5);
      
      // Sort in-place to minimize memory allocation
      valuesToProcess.sort((a, b) => a - b);
      
      // Remove extremes - get the middle values (trimmed mean)
      const trimmedValues = valuesToProcess.slice(1, -1);
      
      // Calculate average of remaining values using a faster reducer
      let sum = 0;
      for (let i = 0; i < trimmedValues.length; i++) {
        sum += trimmedValues[i];
      }
      const avg = Math.round(sum / trimmedValues.length);
      
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
}
