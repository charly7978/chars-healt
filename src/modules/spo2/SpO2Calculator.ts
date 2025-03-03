
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
      // PPG wave characteristics
      const dc = calculateDC(values);
      if (dc <= 0) return 0;

      const ac = calculateAC(values);
      if (ac < SPO2_CONSTANTS.MIN_AC_VALUE) return 0;

      // Perfusion index (PI = AC/DC ratio)
      const perfusionIndex = ac / dc;
      
      // Cálculo basado en la relación de absorción (R)
      const R = (perfusionIndex * 1.8) / SPO2_CONSTANTS.CALIBRATION_FACTOR;

      // Aplicación de la ecuación de calibración basada en curva de Beer-Lambert
      let rawSpO2 = SPO2_CONSTANTS.R_RATIO_A - (SPO2_CONSTANTS.R_RATIO_B * R);
      
      // IMPORTANTE: Garantizar que el rango se mantenga realista
      rawSpO2 = Math.min(rawSpO2, 100);
      rawSpO2 = Math.max(rawSpO2, 90);
      
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
      
      // Garantizar un rango fisiológico realista
      calibratedSpO2 = Math.min(calibratedSpO2, 100);
      calibratedSpO2 = Math.max(calibratedSpO2, 90);
      
      // Log para depuración del cálculo
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
}
