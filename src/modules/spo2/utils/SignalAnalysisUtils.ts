
/**
 * Signal analysis utilities for SpO2 calculation
 * Optimized for performance
 */

/**
 * Calculate variance of a signal - optimized version that returns [variance, mean]
 * Using a single-pass algorithm for better performance
 */
export function calculateVarianceOptimized(values: number[]): [number, number] {
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

/**
 * Calculate consistency weight for Bayesian estimation
 */
export function calculateConsistencyWeight(value: number, allValues: number[]): number {
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
  return Math.exp(-0.5 * zScore * zScore);
}

/**
 * Apply quantum-inspired noise reduction
 */
export function applyQuantumNoiseReduction(values: number[]): number[] {
  // Apply simplified filtering techniques
  const medianFiltered = adaptiveMedianFilter(values);
  return ensembleAverageFilter(medianFiltered);
}

/**
 * Adaptive median filter with variable window size
 */
export function adaptiveMedianFilter(values: number[]): number[] {
  if (values.length < 5) return [...values];
  
  const result: number[] = [];
  const baseWindow = 5;
  
  for (let i = 0; i < values.length; i++) {
    // Get basic window
    const startIdx = Math.max(0, i - Math.floor(baseWindow / 2));
    const endIdx = Math.min(values.length, startIdx + baseWindow);
    const window = values.slice(startIdx, endIdx);
    
    // Sort and take median
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    result.push(median);
  }
  
  return result;
}

/**
 * Ensemble averaging with temporal correlation weights
 */
export function ensembleAverageFilter(values: number[]): number[] {
  if (values.length < 3) return [...values];
  
  const result: number[] = [];
  
  // Handle first and last elements separately
  result.push(values[0]);
  
  for (let i = 1; i < values.length - 1; i++) {
    const weightedAvg = 
      0.25 * values[i-1] +
      0.5 * values[i] +
      0.25 * values[i+1];
    
    result.push(weightedAvg);
  }
  
  result.push(values[values.length - 1]);
  
  return result;
}

/**
 * Apply simple moving average filter
 */
export function applySMAFilterSingle(values: number[], newValue: number, windowSize: number = 5): number {
  const combinedValues = [...values.slice(-windowSize + 1), newValue];
  return combinedValues.reduce((sum, val) => sum + val, 0) / combinedValues.length;
}
