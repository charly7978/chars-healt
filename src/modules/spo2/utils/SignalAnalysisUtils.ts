
/**
 * Signal analysis utilities for SpO2 calculation
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
 * Values closer to the mean get higher weight
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
  // Using bell-shaped curve: exp(-0.5 * z^2)
  return Math.exp(-0.5 * zScore * zScore);
}

/**
 * Apply quantum-inspired noise reduction using ensemble filtering
 * Combines multiple filtering approaches with non-linear dynamics
 */
export function applyQuantumNoiseReduction(values: number[]): number[] {
  // First apply wavelet denoising for high-frequency noise
  const waveletDenoised = waveletDenoise(values);
  
  // Apply median filtering with variable window
  const medianFiltered = adaptiveMedianFilter(waveletDenoised);
  
  // Apply ensemble averaging with temporal correlation
  const ensembleFiltered = ensembleAverageFilter(medianFiltered);
  
  return ensembleFiltered;
}

/**
 * Adaptive median filter with variable window size based on signal quality
 */
export function adaptiveMedianFilter(values: number[]): number[] {
  if (values.length < 5) return [...values];
  
  const result: number[] = [];
  const baseWindow = 5;
  
  for (let i = 0; i < values.length; i++) {
    // Determine adaptive window size
    const localDynamics = calculateLocalDynamics(values, i, baseWindow);
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
export function calculateLocalDynamics(values: number[], index: number, windowSize: number): number {
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
export function ensembleAverageFilter(values: number[]): number[] {
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
 * Wavelet-inspired denoising algorithm to remove high-frequency noise
 * while preserving relevant cardiac signal features
 */
export function waveletDenoise(values: number[]): number[] {
  // Import from signal processing utils if needed
  if (typeof window !== 'undefined' && (window as any).waveletDenoise) {
    return (window as any).waveletDenoise(values);
  }
  
  // Simplified wavelet-inspired denoising
  const result: number[] = [];
  const kernelSize = 5;
  
  // Apply multi-scale averaging (simulating wavelet decomposition)
  for (let i = 0; i < values.length; i++) {
    const scales: number[] = [];
    
    // Scale 1 (minimal smoothing)
    scales.push(applySMAFilterSingle(
      values.slice(Math.max(0, i - 2), i),
      values[i],
      3
    ));
    
    // Scale 2 (medium smoothing)
    scales.push(applySMAFilterSingle(
      values.slice(Math.max(0, i - 4), i),
      values[i],
      5
    ));
    
    // Scale 3 (high smoothing)
    scales.push(applySMAFilterSingle(
      values.slice(Math.max(0, i - 7), i),
      values[i],
      9
    ));
    
    // Weighted average of scales (prioritizing less smoothed signals)
    const denoised = (scales[0] * 0.6) + (scales[1] * 0.3) + (scales[2] * 0.1);
    result.push(denoised);
  }
  
  return result;
}

/**
 * Alternative SMA implementation for single value processing
 */
export function applySMAFilterSingle(values: number[], newValue: number, windowSize: number = 5): number {
  const combinedValues = [...values.slice(-windowSize + 1), newValue];
  return combinedValues.reduce((sum, val) => sum + val, 0) / combinedValues.length;
}
