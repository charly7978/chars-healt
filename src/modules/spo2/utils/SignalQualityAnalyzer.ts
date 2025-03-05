
/**
 * Specialized class for analyzing signal quality in SpO2 measurements
 */
import { calculateVarianceOptimized } from './SignalAnalysisUtils';

export class SignalQualityAnalyzer {
  /**
   * Assess signal quality based on variance and other features
   */
  assessSignalQuality(values: number[]): {
    normalizedVariance: number;
    isQualitySufficient: boolean;
  } {
    if (values.length < 20) {
      return { normalizedVariance: 0, isQualitySufficient: false };
    }
    
    // Calculate signal variance and mean
    const [signalVariance, signalMean] = calculateVarianceOptimized(values);
    
    // Calculate normalized variance
    const normalizedVariance = signalVariance / (signalMean * signalMean);
    
    // Assess if quality is sufficient based on variance thresholds
    const isQualitySufficient = normalizedVariance >= 0.0001 && normalizedVariance <= 0.05;
    
    return { normalizedVariance, isQualitySufficient };
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
}
