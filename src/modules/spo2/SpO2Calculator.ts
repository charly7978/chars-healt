
/**
 * Handles core SpO2 calculation logic
 */
import { calculateAC, calculateDC } from '../../utils/signalProcessingUtils';
import { SPO2_CONSTANTS } from './SpO2Constants';
import { SpO2Calibration } from './SpO2Calibration';
import { SpO2Processor } from './SpO2Processor';

export class SpO2Calculator {
  private calibration: SpO2Calibration;
  private processor: SpO2Processor;
  private lastCalculationTime: number = 0;
  private calculationThrottleMs: number = 60; // Limit calculations to ~16fps

  constructor() {
    this.calibration = new SpO2Calibration();
    this.processor = new SpO2Processor();
    this.lastCalculationTime = 0;
  }

  /**
   * Reset all state variables
   */
  reset(): void {
    this.calibration.reset();
    this.processor.reset();
    this.lastCalculationTime = 0;
  }

  /**
   * Calculate raw SpO2 without filters or calibration
   */
  calculateRaw(values: number[]): number {
    if (values.length < 20) return 0;

    // Throttle calculations to avoid excessive CPU usage
    const now = performance.now();
    if (now - this.lastCalculationTime < this.calculationThrottleMs) {
      return this.processor.getLastValue();
    }
    this.lastCalculationTime = now;

    try {
      // Signal quality check - use a more efficient variance calculation
      const signalVariance = this.calculateVarianceOptimized(values);
      
      // Use cached value for signal mean
      let signalSum = 0;
      for (let i = 0; i < values.length; i++) {
        signalSum += values[i];
      }
      const signalMean = signalSum / values.length;
      
      const normalizedVariance = signalVariance / (signalMean * signalMean);
      
      // If signal quality is poor, return previously calculated value or 0
      if (normalizedVariance < 0.0001 || normalizedVariance > 0.05) {
        return this.processor.getLastValue() || 0;
      }
      
      // PPG wave characteristics
      const dc = calculateDC(values);
      if (dc <= 0) return this.processor.getLastValue() || 0;

      const ac = calculateAC(values);
      if (ac < SPO2_CONSTANTS.MIN_AC_VALUE) return this.processor.getLastValue() || 0;

      // Calculate Perfusion Index (PI = AC/DC ratio)
      const perfusionIndex = ac / dc;
      
      // Skip calculation if perfusion index is too low or too high (unrealistic)
      if (perfusionIndex < 0.01 || perfusionIndex > 10) {
        return this.processor.getLastValue() || 0;
      }
      
      // Calculate R ratio (improved formula based on Beer-Lambert law)
      const R = (perfusionIndex * 1.8) / SPO2_CONSTANTS.CALIBRATION_FACTOR;
      
      // Apply calibration equation (based on empirical data)
      let rawSpO2 = SPO2_CONSTANTS.R_RATIO_A - (SPO2_CONSTANTS.R_RATIO_B * R);
      
      // Ensure physiologically realistic range
      rawSpO2 = Math.min(rawSpO2, 100);
      rawSpO2 = Math.max(rawSpO2, 90);
      
      return Math.round(rawSpO2);
    } catch (err) {
      return this.processor.getLastValue() || 0;
    }
  }

  /**
   * Calibrate SpO2 based on initial values
   */
  calibrate(): void {
    this.calibration.calibrate();
  }

  /**
   * Add calibration value
   */
  addCalibrationValue(value: number): void {
    this.calibration.addValue(value);
  }

  /**
   * Calculate SpO2 with all filters and calibration
   */
  calculate(values: number[]): number {
    try {
      // If not enough values or no finger, use previous value or 0
      if (values.length < 20) {
        return this.processor.getLastValue() || 0;
      }

      // Get raw SpO2 value
      const rawSpO2 = this.calculateRaw(values);
      if (rawSpO2 <= 0) {
        return this.processor.getLastValue() || 0;
      }

      // Save raw value for analysis
      this.processor.addRawValue(rawSpO2);

      // Apply calibration if available
      let calibratedSpO2 = rawSpO2;
      if (this.calibration.isCalibrated()) {
        calibratedSpO2 = rawSpO2 + this.calibration.getOffset();
      }
      
      // Ensure physiologically realistic range
      calibratedSpO2 = Math.min(calibratedSpO2, 100);
      calibratedSpO2 = Math.max(calibratedSpO2, 90);
      
      // Process and filter the SpO2 value
      const finalSpO2 = this.processor.processValue(calibratedSpO2);
      
      return finalSpO2;
    } catch (err) {
      return this.processor.getLastValue() || 0;
    }
  }
  
  /**
   * Calculate variance of a signal - optimized version
   */
  private calculateVarianceOptimized(values: number[]): number {
    let sum = 0;
    let sumSquared = 0;
    const n = values.length;
    
    // Single pass algorithm for variance
    for (let i = 0; i < n; i++) {
      sum += values[i];
      sumSquared += values[i] * values[i];
    }
    
    const mean = sum / n;
    const variance = sumSquared / n - mean * mean;
    return variance;
  }
}
