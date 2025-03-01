
/**
 * Handles SpO2 calibration functionality
 */
import { SPO2_CONSTANTS } from './SpO2Constants';

export class SpO2Calibration {
  private calibrationValues: number[] = [];
  private calibrated: boolean = false;
  private calibrationOffset: number = 0;

  /**
   * Reset calibration state
   */
  reset(): void {
    this.calibrationValues = [];
    this.calibrated = false;
    this.calibrationOffset = 0;
  }

  /**
   * Add calibration value
   */
  addValue(value: number): void {
    if (value > 0) {
      this.calibrationValues.push(value);
      // Reduce the buffer to 8 values (was 10) to make calibration more responsive
      if (this.calibrationValues.length > 8) {
        this.calibrationValues.shift();
      }
    }
  }

  /**
   * Calibrate SpO2 based on initial values
   */
  calibrate(): void {
    // Reduce required samples to 3 (was 5) for faster calibration
    if (this.calibrationValues.length < 3) return;
    
    // Sort values and use a wider range (20% to 80%) to improve detection sensitivity
    const sortedValues = [...this.calibrationValues].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedValues.length * 0.2);  // was 0.25
    const endIdx = Math.floor(sortedValues.length * 0.8);    // was 0.75
    
    // Take the middle range of values
    const middleValues = sortedValues.slice(startIdx, endIdx + 1);
    
    if (middleValues.length > 0) {
      // Calculate average of middle range
      const avgValue = middleValues.reduce((sum, val) => sum + val, 0) / middleValues.length;
      
      // If average is reasonable, use as calibration base
      if (avgValue > 0) {
        // Fine-tune calibration offset with a slight adjustment factor
        // This helps with better arrhythmia detection sensitivity
        this.calibrationOffset = (SPO2_CONSTANTS.BASELINE - avgValue) * 1.05;
        console.log('SpO2 calibrated with adjusted offset:', this.calibrationOffset, 'from avg value:', avgValue);
        this.calibrated = true;
      }
    }
  }

  /**
   * Check if calibration is completed
   */
  isCalibrated(): boolean {
    return this.calibrated;
  }

  /**
   * Get calibration offset
   */
  getOffset(): number {
    return this.calibrationOffset;
  }
}
