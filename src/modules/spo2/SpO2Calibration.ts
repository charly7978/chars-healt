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
      // Keep only the last 10 values
      if (this.calibrationValues.length > 10) {
        this.calibrationValues.shift();
      }
    }
  }

  /**
   * Calibrate SpO2 based on initial values
   */
  calibrate(): void {
    if (this.calibrationValues.length < 5) return;
    
    // Sort values and remove outliers (bottom 25% and top 25%)
    const sortedValues = [...this.calibrationValues].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedValues.length * 0.25);
    const endIdx = Math.floor(sortedValues.length * 0.75);
    
    // Take the middle range of values
    const middleValues = sortedValues.slice(startIdx, endIdx + 1);
    
    if (middleValues.length > 0) {
      // Calculate average of middle range
      const avgValue = middleValues.reduce((sum, val) => sum + val, 0) / middleValues.length;
      
      // If average is reasonable, use as calibration base
      if (avgValue > 0) {
        // Adjust to target normal healthy range (95-98%)
        this.calibrationOffset = SPO2_CONSTANTS.BASELINE - avgValue;
        console.log('SpO2 calibrated with offset:', this.calibrationOffset);
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
