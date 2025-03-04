
/**
 * Apply Simple Moving Average filter to a signal
 */
export function applySMAFilter(signal: number[], newValue: number, windowSize: number): number {
  if (signal.length === 0) return newValue;
  
  // Calculate how many samples to use for the moving average
  const samplesToUse = Math.min(windowSize, signal.length);
  
  // Calculate the sum of the most recent samples
  let sum = newValue;
  for (let i = 1; i <= samplesToUse; i++) {
    sum += signal[signal.length - i];
  }
  
  // Return the average
  return sum / (samplesToUse + 1);
}

/**
 * Calculate the AC component of a signal
 */
export function calculateAC(values: number[]): number {
  if (values.length < 2) return 0;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max - min;
}

/**
 * Calculate the DC component of a signal
 */
export function calculateDC(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation of a signal
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Enhanced peak detection algorithm
 */
export function enhancedPeakDetection(values: number[], threshold = 0.5): number[] {
  const peaks: number[] = [];
  if (values.length < 3) return peaks;

  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1] && values[i] > threshold) {
      peaks.push(i);
    }
  }
  return peaks;
}
