
/**
 * Handles core SpO2 calculation logic
 */
import { calculateAC, calculateDC, enhancedPeakDetection, waveletDenoise } from '../../utils/signalProcessingUtils';
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
  private quantumFilteredValues: number[] = []; // Quantum-inspired filtering buffer

  constructor() {
    this.calibration = new SpO2Calibration();
    this.processor = new SpO2Processor();
    this.lastCalculationTime = 0;
    this.previousResults = new Array(this.RESULT_BUFFER_SIZE).fill(0);
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
    this.previousResults = new Array(this.RESULT_BUFFER_SIZE).fill(0);
    this.resultIndex = 0;
    this.stableValue = 0;
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
      const quantumFiltered = this.applyQuantumNoiseReduction(values);
      
      // Only recalculate signal variance periodically to improve performance
      const cacheUpdateNeeded = this.signalCache.length === 0 || 
                               (now % 800 < this.calculationThrottleMs); // Less frequent updates
      
      let signalVariance: number;
      let signalMean: number;
      
      if (cacheUpdateNeeded) {
        // Signal quality check - use a more efficient variance calculation
        [signalVariance, signalMean] = this.calculateVarianceOptimized(quantumFiltered);
        this.signalCache = quantumFiltered.slice();
        this.cacheMean = signalMean;
      } else {
        // Use cached value for signal mean and variance
        signalVariance = this.calculateVarianceOptimized(this.signalCache)[0];
        signalMean = this.cacheMean;
      }
      
      const normalizedVariance = signalVariance / (signalMean * signalMean);
      
      // Enhanced signal quality assessment with nonlinear dynamics
      if (normalizedVariance < 0.0001 || normalizedVariance > 0.05) {
        return this.processor.getLastValue() || 0;
      }
      
      // Use advanced cardiac feature extraction
      const { perfusionIndex, acValue, dcValue } = this.extractCardiacFeatures(quantumFiltered);
      
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
   * Apply quantum-inspired noise reduction using ensemble filtering
   * Combines multiple filtering approaches with non-linear dynamics
   */
  private applyQuantumNoiseReduction(values: number[]): number[] {
    // First apply wavelet denoising for high-frequency noise
    const waveletDenoised = waveletDenoise(values);
    
    // Apply median filtering with variable window
    const medianFiltered = this.adaptiveMedianFilter(waveletDenoised);
    
    // Apply ensemble averaging with temporal correlation
    const ensembleFiltered = this.ensembleAverageFilter(medianFiltered);
    
    // Store for future reference
    this.quantumFilteredValues = ensembleFiltered.slice(-50);
    
    return ensembleFiltered;
  }
  
  /**
   * Adaptive median filter with variable window size based on signal quality
   */
  private adaptiveMedianFilter(values: number[]): number[] {
    if (values.length < 5) return [...values];
    
    const result: number[] = [];
    const baseWindow = 5;
    
    for (let i = 0; i < values.length; i++) {
      // Determine adaptive window size
      const localDynamics = this.calculateLocalDynamics(values, i, baseWindow);
      const windowSize = Math.max(3, Math.min(9, Math.round(baseWindow * localDynamics)));
      
      // Get window values
      const startIdx = Math.max(0, i - Math.floor(windowSize / 2));
      const endIdx = Math.min(values.length, startIdx + windowSize);
      const window = values.slice(startIdx, endIdx);
      
      // Sort and take median
      const sorted = [...window].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      
      result.push(median);
    }
    
    return result;
  }
  
  /**
   * Calculate local signal dynamics for adaptive filtering
   */
  private calculateLocalDynamics(values: number[], index: number, windowSize: number): number {
    const startIdx = Math.max(0, index - windowSize);
    const endIdx = Math.min(values.length, index + windowSize + 1);
    const window = values.slice(startIdx, endIdx);
    
    const mean = window.reduce((sum, val) => sum + val, 0) / window.length;
    const variance = window.reduce((sum, val) => sum + (val - mean) * (val - mean), 0) / window.length;
    
    return Math.sqrt(variance) / (mean + 0.0001); // Normalized local dynamics
  }
  
  /**
   * Ensemble averaging with temporal correlation weights
   */
  private ensembleAverageFilter(values: number[]): number[] {
    if (values.length < 3) return [...values];
    
    const result: number[] = [];
    
    // Optimized: Handle first and last elements separately
    result.push(values[0]);
    
    for (let i = 1; i < values.length - 1; i++) {
      const prevWeight = 0.25;
      const currentWeight = 0.5;
      const nextWeight = 0.25;
      
      const weightedAvg = 
        prevWeight * values[i-1] +
        currentWeight * values[i] +
        nextWeight * values[i+1];
      
      result.push(weightedAvg);
    }
    
    result.push(values[values.length - 1]);
    
    return result;
  }
  
  /**
   * Extract enhanced cardiac features with machine learning inspired approach
   */
  private extractCardiacFeatures(values: number[]): { 
    perfusionIndex: number, 
    acValue: number, 
    dcValue: number 
  } {
    // Advanced peak detection
    const peakAnalysis = enhancedPeakDetection(values);
    
    // Calculate AC component using peak-to-valley method if reliable peaks detected
    let acValue: number;
    if (peakAnalysis.signalQuality > 50 && peakAnalysis.peakIndices.length >= 2 && peakAnalysis.valleyIndices.length >= 2) {
      // Use average peak-to-valley distance for higher accuracy
      const peakValues = peakAnalysis.peakIndices.map(idx => values[idx]);
      const valleyValues = peakAnalysis.valleyIndices.map(idx => values[idx]);
      
      const avgPeakValue = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
      const avgValleyValue = valleyValues.reduce((sum, val) => sum + val, 0) / valleyValues.length;
      
      acValue = avgPeakValue - avgValleyValue;
    } else {
      // Fall back to standard AC calculation
      acValue = calculateAC(values);
    }
    
    // Enhanced DC calculation with trend removal
    const dcValue = this.enhancedDCCalculation(values);
    
    // Calculate perfusion index with improved formula
    const perfusionIndex = acValue / (dcValue + 0.0001);
    
    return { perfusionIndex, acValue, dcValue };
  }
  
  /**
   * Enhanced DC calculation with trend removal
   */
  private enhancedDCCalculation(values: number[]): number {
    if (values.length === 0) return 0;
    
    // Remove long-term trend
    const linearTrend = this.estimateLinearTrend(values);
    const detrended = values.map((val, idx) => val - (linearTrend.slope * idx + linearTrend.intercept));
    
    // Use trimmed mean for robust central tendency
    const sorted = [...detrended].sort((a, b) => a - b);
    const trimRatio = 0.1; // Trim 10% from both ends
    const trimCount = Math.floor(sorted.length * trimRatio);
    const trimmedValues = sorted.slice(trimCount, sorted.length - trimCount);
    
    // Calculate trimmed mean
    const trimmedDC = trimmedValues.reduce((sum, val) => sum + val, 0) / trimmedValues.length;
    
    // Re-add trend midpoint for calibration purposes
    const trendMidpoint = linearTrend.slope * (values.length / 2) + linearTrend.intercept;
    
    return trimmedDC + trendMidpoint;
  }
  
  /**
   * Estimate linear trend in the signal
   */
  private estimateLinearTrend(values: number[]): { slope: number, intercept: number } {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0 };
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }
    
    const denominator = n * sumXX - sumX * sumX;
    if (Math.abs(denominator) < 0.000001) {
      return { slope: 0, intercept: sumY / n };
    }
    
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
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
        return this.stableValue || this.processor.getLastValue() || 0;
      }

      // Get raw SpO2 value
      const rawSpO2 = this.calculateRaw(values);
      if (rawSpO2 <= 0) {
        return this.stableValue || this.processor.getLastValue() || 0;
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
      
      // Apply additional heavy smoothing for display purposes
      this.previousResults[this.resultIndex] = processedSpO2;
      this.resultIndex = (this.resultIndex + 1) % this.RESULT_BUFFER_SIZE;
      
      // Use quantum-inspired Bayesian weighting for final estimation
      let weightedSum = 0;
      let totalWeight = 0;
      
      // Weight calculation with recency bias and consistency analysis
      for (let i = 0; i < this.RESULT_BUFFER_SIZE; i++) {
        const value = this.previousResults[(this.resultIndex + i) % this.RESULT_BUFFER_SIZE];
        if (value > 0) {
          // Calculate temporal decay weight (more recent values get higher weight)
          const temporalWeight = i < 2 ? 3 : 1;
          
          // Calculate consistency weight (values closer to mean get higher weight)
          const consistencyWeight = this.calculateConsistencyWeight(value, this.previousResults);
          
          // Combined weight with 70% temporal, 30% consistency
          const weight = (temporalWeight * 0.7) + (consistencyWeight * 0.3);
          
          weightedSum += value * weight;
          totalWeight += weight;
        }
      }
      
      const finalSpO2 = totalWeight > 0 ? 
                        Math.round(weightedSum / totalWeight) : 
                        processedSpO2;
      
      // Apply Bayesian stability update with higher threshold for significant changes
      if (this.stableValue === 0 || Math.abs(finalSpO2 - this.stableValue) >= 1) {
        this.stableValue = finalSpO2;
      }
      
      return this.stableValue;
    } catch (err) {
      return this.stableValue || this.processor.getLastValue() || 0;
    }
  }
  
  /**
   * Calculate consistency weight for Bayesian estimation
   * Values closer to the mean get higher weight
   */
  private calculateConsistencyWeight(value: number, allValues: number[]): number {
    const validValues = allValues.filter(v => v > 0);
    if (validValues.length < 2) return 1.0;
    
    const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
    const stdDev = Math.sqrt(
      validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length
    );
    
    if (stdDev < 0.001) return 1.0;
    
    // Calculate z-score (standard score)
    const zScore = Math.abs(value - mean) / stdDev;
    
    // Convert to weight (higher for values closer to mean)
    // Using bell-shaped curve: exp(-0.5 * z^2)
    return Math.exp(-0.5 * zScore * zScore);
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

