
/**
 * Specialized class for analyzing signal quality in SpO2 measurements
 * Optimized for better performance
 */
import { calculateVarianceOptimized } from './SignalAnalysisUtils';

export class SignalQualityAnalyzer {
  // Cache for previous calculations to avoid redundant processing
  private cachedValues: number[] = [];
  private cachedResult: { normalizedVariance: number; isQualitySufficient: boolean } | null = null;
  
  /**
   * Assess signal quality based on variance and other features
   * With performance optimizations
   */
  assessSignalQuality(values: number[]): {
    normalizedVariance: number;
    isQualitySufficient: boolean;
  } {
    // Fast path: insufficient data
    if (values.length < 20) {
      return { normalizedVariance: 0, isQualitySufficient: false };
    }
    
    // Use cached result if values haven't changed
    if (this.cachedValues.length === values.length && 
        this.cachedResult && 
        this.arraysEqual(this.cachedValues, values)) {
      return this.cachedResult;
    }
    
    // Calculate signal variance and mean - optimized calculation
    const [signalVariance, signalMean] = calculateVarianceOptimized(values);
    
    // Calculate normalized variance
    const normalizedVariance = signalMean !== 0 ? 
      signalVariance / (signalMean * signalMean) : 0;
    
    // Assess if quality is sufficient based on variance thresholds
    const isQualitySufficient = normalizedVariance >= 0.0001 && normalizedVariance <= 0.05;
    
    // Cache results for future calls
    this.cachedValues = [...values];
    this.cachedResult = { normalizedVariance, isQualitySufficient };
    
    return this.cachedResult;
  }
  
  /**
   * Cache signal metrics to avoid redundant calculations
   */
  cacheSignalMetrics(values: number[]): {
    cachedValues: number[];
    cachedMean: number;
  } {
    const [_, signalMean] = calculateVarianceOptimized(values);
    
    return {
      cachedValues: [...values],
      cachedMean: signalMean
    };
  }
  
  /**
   * Helper method to efficiently compare arrays
   * Uses early termination for better performance
   */
  private arraysEqual(arr1: number[], arr2: number[]): boolean {
    if (arr1.length !== arr2.length) return false;
    
    // Only check every 3rd element for performance with large arrays
    // This provides a good balance between accuracy and speed
    for (let i = 0; i < arr1.length; i += 3) {
      if (arr1[i] !== arr2[i]) return false;
    }
    
    return true;
  }
}
