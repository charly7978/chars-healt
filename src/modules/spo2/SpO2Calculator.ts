
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

  constructor() {
    this.calibration = new SpO2Calibration();
    this.processor = new SpO2Processor();
  }

  /**
   * Reset all state variables
   */
  reset(): void {
    this.calibration.reset();
    this.processor.reset();
  }

  /**
   * Calculate raw SpO2 without filters or calibration
   */
  calculateRaw(values: number[]): number {
    if (values.length < 20) return 0;

    try {
      // Signal quality check
      const signalVariance = this.calculateVariance(values);
      const signalMean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const normalizedVariance = signalVariance / (signalMean * signalMean);
      
      // If signal quality is poor, return 0
      if (normalizedVariance < 0.0001 || normalizedVariance > 0.05) {
        console.log(`SpO2 signal quality too low: ${normalizedVariance.toFixed(6)}`);
        return 0;
      }
      
      // PPG wave characteristics
      const dc = calculateDC(values);
      if (dc <= 0) return 0;

      const ac = calculateAC(values);
      if (ac < SPO2_CONSTANTS.MIN_AC_VALUE) return 0;

      // Calculate Perfusion Index (PI = AC/DC ratio)
      const perfusionIndex = ac / dc;
      
      // Skip calculation if perfusion index is too low or too high (unrealistic)
      if (perfusionIndex < 0.01 || perfusionIndex > 10) {
        console.log(`Perfusion index out of range: ${perfusionIndex.toFixed(4)}`);
        return 0;
      }
      
      // Calculate R ratio (improved formula based on Beer-Lambert law)
      const R = (perfusionIndex * 1.8) / SPO2_CONSTANTS.CALIBRATION_FACTOR;
      
      // Apply calibration equation (based on empirical data)
      let rawSpO2 = SPO2_CONSTANTS.R_RATIO_A - (SPO2_CONSTANTS.R_RATIO_B * R);
      
      // Ensure physiologically realistic range
      rawSpO2 = Math.min(rawSpO2, 100);
      rawSpO2 = Math.max(rawSpO2, 90);
      
      console.log(`Raw SpO2 calculation: PI=${perfusionIndex.toFixed(4)}, R=${R.toFixed(4)}, SpO2=${Math.round(rawSpO2)}%`);
      
      return Math.round(rawSpO2);
    } catch (err) {
      console.error("Error in SpO2 calculation:", err);
      return 0;
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
        const lastValue = this.processor.getLastValue();
        if (lastValue > 0) {
          return lastValue;
        }
        return 0;
      }

      // Get raw SpO2 value
      const rawSpO2 = this.calculateRaw(values);
      if (rawSpO2 <= 0) {
        const lastValue = this.processor.getLastValue();
        if (lastValue > 0) {
          return lastValue;
        }
        return 0;
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
      
      // Log for debugging
      console.log(`SpO2: raw=${rawSpO2}, calibrated=${calibratedSpO2}`);
      
      // Process and filter the SpO2 value
      const finalSpO2 = this.processor.processValue(calibratedSpO2);
      
      return finalSpO2;
    } catch (err) {
      console.error("Error in final SpO2 processing:", err);
      const lastValue = this.processor.getLastValue();
      if (lastValue > 0) {
        return lastValue;
      }
      return 0;
    }
  }
  
  /**
   * Calculate variance of a signal
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
}
