
/**
 * Handles SpO2 signal processing and filtering
 */
import { SPO2_CONSTANTS } from './SpO2Constants';

export class SpO2Processor {
  private spo2Buffer: number[] = [];
  private spo2RawBuffer: number[] = [];
  private lastSpo2Value: number = 0;

  /**
   * Reset processor state
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2RawBuffer = [];
    this.lastSpo2Value = 0;
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
    // Apply median filter to eliminate outliers
    let filteredSpO2 = calibratedSpO2;
    if (this.spo2RawBuffer.length >= 5) {
      const recentValues = [...this.spo2RawBuffer].slice(-5);
      recentValues.sort((a, b) => a - b);
      filteredSpO2 = recentValues[Math.floor(recentValues.length / 2)];
    }

    // Maintain buffer of values for stability
    this.spo2Buffer.push(filteredSpO2);
    if (this.spo2Buffer.length > SPO2_CONSTANTS.BUFFER_SIZE) {
      this.spo2Buffer.shift();
    }

    // Calculate trimmed mean from buffer (discarding extreme values)
    if (this.spo2Buffer.length >= 5) {
      // Sort values to discard highest and lowest
      const sortedValues = [...this.spo2Buffer].sort((a, b) => a - b);
      
      // Remove extremes if there are sufficient values
      const trimmedValues = sortedValues.slice(1, -1);
      
      // Calculate average of remaining values
      const sum = trimmedValues.reduce((a, b) => a + b, 0);
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
    
    // Ensure the value is in physiologically possible range
    filteredSpO2 = Math.max(90, Math.min(99, filteredSpO2));
    
    // Update the last valid value
    this.lastSpo2Value = filteredSpO2;
    
    console.log(`SpO2 processed: ${filteredSpO2}% (from: ${calibratedSpO2}%)`);
    
    return filteredSpO2;
  }
}
