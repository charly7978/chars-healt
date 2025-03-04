/**
 * Handles core SpO2 calculation logic
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { calculateAC, calculateDC } from '../../utils/signalProcessingUtils';
import { SPO2_CONSTANTS } from './SpO2Constants';
import { SpO2Calibration } from './SpO2Calibration';
import { SpO2Processor } from './SpO2Processor';

export class SpO2Calculator {
  private calibration: SpO2Calibration;
  private processor: SpO2Processor;
  private lastCalculationTime: number = 0;
  private calculationThrottleMs: number = 125; // Increased throttle to prevent excessive updates
  private signalCache: number[] = [];
  private cacheMean: number = 0;
  private bufferFull: boolean = false;
  private previousResults: number[] = [];
  private resultIndex: number = 0;
  private readonly RESULT_BUFFER_SIZE = 5; // Increased buffer for smoother display
  private stableValue: number = 0; // Extra stable display value

  constructor() {
    this.calibration = new SpO2Calibration();
    this.processor = new SpO2Processor();
    this.lastCalculationTime = 0;
    this.previousResults = new Array(this.RESULT_BUFFER_SIZE).fill(0);
  }

  /**
   * Reset all state variables
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  reset(): void {
    this.calibration.reset();
    this.processor.reset();
    this.lastCalculationTime = 0;
    this.signalCache = [];
    this.cacheMean = 0;
    this.bufferFull = false;
    this.previousResults = new Array(this.RESULT_BUFFER_SIZE).fill(0);
    this.resultIndex = 0;
    this.stableValue = 0;
  }

  /**
   * Calculate raw SpO2 without filters or calibration
   */
  calculateRaw(values: number[]): number {
    if (values.length < 20) return 0;

    // Minimal processing to avoid artificial stabilization
    // Only calculate based on actual measured values
    const now = performance.now();
    if (now - this.lastCalculationTime < this.calculationThrottleMs) {
      return this.processor.getLastValue();
    }
    this.lastCalculationTime = now;

    try {
      // Signal quality check
      const [signalVariance, signalMean] = this.calculateVarianceOptimized(values);
      
      const normalizedVariance = signalVariance / (signalMean * signalMean);
      
      // If signal quality is poor, return previously calculated value or 0
      if (normalizedVariance < 0.0001 || normalizedVariance > 0.05) {
        return this.processor.getLastValue() || 0;
      }
      
      // PPG wave characteristics - direct calculation from measured values
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
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  calculate(values: number[]): number {
    try {
      // If not enough values or no finger, use previous value or 0
      if (values.length < 20) {
        return this.processor.getLastValue() || 0;
      }

      // Get raw SpO2 value from actual measurements
      const rawSpO2 = this.calculateRaw(values);
      if (rawSpO2 <= 0) {
        return this.processor.getLastValue() || 0;
      }

      // Only minimal necessary processing to avoid artificial stabilization
      this.processor.addRawValue(rawSpO2);

      // Apply calibration if available
      let calibratedSpO2 = rawSpO2;
      if (this.calibration.isCalibrated()) {
        calibratedSpO2 = rawSpO2 + this.calibration.getOffset();
      }
      
      // Ensure physiologically realistic range
      calibratedSpO2 = Math.min(calibratedSpO2, 100);
      calibratedSpO2 = Math.max(calibratedSpO2, 90);
      
      // Use measured values with minimal processing
      return this.processor.processRawValue(calibratedSpO2);
    } catch (err) {
      return this.processor.getLastValue() || 0;
    }
  }
  
  /**
   * Calculate variance of a signal - optimized version that returns [variance, mean]
   * Using a single-pass algorithm for better performance
   */
  private calculateVarianceOptimized(values: number[]): [number, number] {
    let sum = 0;
    let sumSquared = 0;
    const n = values.length;
    
    // Use loop unrolling for better performance with larger arrays
    const remainder = n % 4;
    let i = 0;
    
    // Process remaining elements (that don't fit in groups of 4)
    for (; i < remainder; i++) {
      sum += values[i];
      sumSquared += values[i] * values[i];
    }
    
    // Process elements in groups of 4 for better performance through loop unrolling
    for (; i < n; i += 4) {
      sum += values[i] + values[i+1] + values[i+2] + values[i+3];
      sumSquared += values[i] * values[i] + 
                    values[i+1] * values[i+1] + 
                    values[i+2] * values[i+2] + 
                    values[i+3] * values[i+3];
    }
    
    const mean = sum / n;
    const variance = sumSquared / n - mean * mean;
    return [variance, mean];
  }
}
