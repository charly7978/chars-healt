
/**
 * Specialized class for stabilizing SpO2 signal values
 */
import { calculateMode, insertionSort } from './utils/SignalUtils';

export class SignalStabilizer {
  private stabilityBuffer: number[] = [];
  private medianCache: number[] = new Array(5).fill(0);
  
  /**
   * Reset the stabilizer state
   */
  reset(): void {
    this.stabilityBuffer = [];
    this.medianCache = new Array(5).fill(0);
  }
  
  /**
   * Apply median filtering to eliminate outliers
   */
  applyMedianFilter(spo2RawBuffer: number[], bufferLength: number): number {
    if (bufferLength < 5) return 0;
    
    // Use quick select for median with pre-allocated array
    const recentValues = this.medianCache;
    
    // Get the 5 most recent values
    const startIdx = Math.max(0, bufferLength - 5);
    for (let i = 0; i < 5; i++) {
      recentValues[i] = spo2RawBuffer[startIdx + i] || spo2RawBuffer[spo2RawBuffer.length - 1];
    }
    
    // Optimized sort for small arrays
    insertionSort(recentValues, 5);
    
    // Return the median (middle element)
    return recentValues[2];
  }
  
  /**
   * Stabilize a value using ensemble methods
   */
  stabilizeValue(filteredSpO2: number): number {
    // Add to stability buffer
    if (this.stabilityBuffer.length >= 10) {
      this.stabilityBuffer.shift();
    }
    this.stabilityBuffer.push(filteredSpO2);
    
    // Use ensemble method combining mode and median from stability buffer
    if (this.stabilityBuffer.length >= 3) {
      const modeValue = calculateMode(this.stabilityBuffer);
      const sortedBuffer = [...this.stabilityBuffer].sort((a, b) => a - b);
      const medianValue = sortedBuffer[Math.floor(sortedBuffer.length / 2)];
      
      // Weighted average of mode (70%) and median (30%)
      const stabilizedValue = Math.round((modeValue * 0.7) + (medianValue * 0.3));
      
      // Ensure the value is in physiologically possible range
      return Math.max(90, Math.min(99, stabilizedValue));
    }
    
    return Math.max(90, Math.min(99, filteredSpO2));
  }
  
  /**
   * Get the stability buffer
   */
  getStabilityBuffer(): number[] {
    return [...this.stabilityBuffer];
  }
}
