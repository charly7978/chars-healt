
/**
 * Specialized class for extracting cardiac features from SpO2 signals
 */
import { calculateAC, calculateDC, enhancedPeakDetection } from '../../../utils/signalProcessingUtils';
import { SPO2_CONSTANTS } from '../SpO2Constants';

export class CardiacFeatureExtractor {
  /**
   * Extract enhanced cardiac features with machine learning inspired approach
   */
  extractCardiacFeatures(values: number[]): { 
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
}
