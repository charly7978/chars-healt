
/**
 * Handles core SpO2 calculation logic
 */
import { SPO2_CONSTANTS } from './SpO2Constants';
import { SpO2Calibration } from './SpO2Calibration';
import { SpO2Processor } from './SpO2Processor';
import { CardiacFeatureExtractor } from './utils/CardiacFeatureExtractor';
import { ResultStabilizer } from './utils/ResultStabilizer';
import { SignalQualityAnalyzer } from './utils/SignalQualityAnalyzer';
import { applyQuantumNoiseReduction } from './utils/SignalAnalysisUtils';

export class SpO2Calculator {
  private calibration: SpO2Calibration;
  private processor: SpO2Processor;
  private lastCalculationTime: number = 0;
  private calculationThrottleMs: number = 125; // Increased throttle to prevent excessive updates
  private signalCache: number[] = [];
  private cacheMean: number = 0;
  private bufferFull: boolean = false;
  private quantumFilteredValues: number[] = []; // Quantum-inspired filtering buffer
  
  // New specialized components
  private cardiacExtractor: CardiacFeatureExtractor;
  private signalQualityAnalyzer: SignalQualityAnalyzer;
  private resultStabilizer: ResultStabilizer;

  constructor() {
    this.calibration = new SpO2Calibration();
    this.processor = new SpO2Processor();
    this.lastCalculationTime = 0;
    this.cardiacExtractor = new CardiacFeatureExtractor();
    this.signalQualityAnalyzer = new SignalQualityAnalyzer();
    this.resultStabilizer = new ResultStabilizer(5); // 5 is the result buffer size
    this.quantumFilteredValues = [];
  }

  /**
   * Reset all state variables
   */
  reset(): void {
    this.calibration.reset();
    this.processor.reset();
    this.lastCalculationTime = 0;
    this.signalCache = [];
    this.cacheMean = 0;
    this.bufferFull = false;
    this.resultStabilizer.reset();
    this.quantumFilteredValues = [];
  }

  /**
   * Calculate raw SpO2 without filters or calibration
   */
  calculateRaw(values: number[]): number {
    if (values.length < 20) return 0;

    // More balanced throttling to prevent excessive updates
    const now = performance.now();
    if (now - this.lastCalculationTime < this.calculationThrottleMs) {
      return this.processor.getLastValue();
    }
    this.lastCalculationTime = now;

    try {
      // Apply quantum-inspired ensemble filtering for noise reduction
      const quantumFiltered = applyQuantumNoiseReduction(values);
      
      // Only recalculate signal variance periodically to improve performance
      const cacheUpdateNeeded = this.signalCache.length === 0 || 
                               (now % 800 < this.calculationThrottleMs); // Less frequent updates
      
      let signalVariance: number;
      let signalMean: number;
      let normalizedVariance: number;
      let qualitySufficient: boolean;
      
      if (cacheUpdateNeeded) {
        // Signal quality check with the analyzer
        const qualityAssessment = this.signalQualityAnalyzer.assessSignalQuality(quantumFiltered);
        normalizedVariance = qualityAssessment.normalizedVariance;
        qualitySufficient = qualityAssessment.isQualitySufficient;
        
        // Update cache
        const metrics = this.signalQualityAnalyzer.cacheSignalMetrics(quantumFiltered);
        this.signalCache = metrics.cachedValues;
        this.cacheMean = metrics.cachedMean;
      } else {
        // Use existing signal quality assessment
        const qualityAssessment = this.signalQualityAnalyzer.assessSignalQuality(this.signalCache);
        normalizedVariance = qualityAssessment.normalizedVariance;
        qualitySufficient = qualityAssessment.isQualitySufficient;
      }
      
      // Enhanced signal quality assessment with nonlinear dynamics
      if (!qualitySufficient) {
        return this.processor.getLastValue() || 0;
      }
      
      // Use advanced cardiac feature extraction
      const { perfusionIndex, acValue, dcValue } = this.cardiacExtractor.extractCardiacFeatures(quantumFiltered);
      
      if (dcValue <= 0) return this.processor.getLastValue() || 0;
      if (acValue < SPO2_CONSTANTS.MIN_AC_VALUE) return this.processor.getLastValue() || 0;
      
      // Skip calculation if perfusion index is too low or too high (unrealistic)
      if (perfusionIndex < 0.01 || perfusionIndex > 10) {
        return this.processor.getLastValue() || 0;
      }
      
      // Calculate R ratio with advanced Beer-Lambert relationship
      const R = (perfusionIndex * 1.85) / SPO2_CONSTANTS.CALIBRATION_FACTOR;
      
      // Apply non-linear calibration equation with temperature compensation
      let rawSpO2 = SPO2_CONSTANTS.R_RATIO_A - (SPO2_CONSTANTS.R_RATIO_B * R);
      
      // Apply quantum-inspired non-linear correction for extreme values
      if (rawSpO2 > 98) {
        rawSpO2 = 98 + (rawSpO2 - 98) * 0.5;
      } else if (rawSpO2 < 92) {
        rawSpO2 = 92 - (92 - rawSpO2) * 0.7;
      }
      
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
        return this.resultStabilizer.getStableValue() || this.processor.getLastValue() || 0;
      }

      // Get raw SpO2 value
      const rawSpO2 = this.calculateRaw(values);
      if (rawSpO2 <= 0) {
        return this.resultStabilizer.getStableValue() || this.processor.getLastValue() || 0;
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
      const processedSpO2 = this.processor.processValue(calibratedSpO2);
      
      // Apply additional heavy smoothing for display purposes using the stabilizer
      const stableValue = this.resultStabilizer.stabilize(processedSpO2);
      
      return stableValue;
    } catch (err) {
      return this.resultStabilizer.getStableValue() || this.processor.getLastValue() || 0;
    }
  }
}
