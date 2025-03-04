
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
 * Returns indices of peaks, valleys, and overall signal quality
 */
export function enhancedPeakDetection(values: number[], threshold = 0.5): { 
  peakIndices: number[]; 
  valleyIndices: number[]; 
  signalQuality: number;
} {
  const peakIndices: number[] = [];
  const valleyIndices: number[] = [];
  
  if (values.length < 3) {
    return { 
      peakIndices: [], 
      valleyIndices: [], 
      signalQuality: 0 
    };
  }

  // Detect peaks
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1] && values[i] > threshold) {
      peakIndices.push(i);
    }
    // Detect valleys
    if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
      valleyIndices.push(i);
    }
  }
  
  // Calculate signal quality (0-1)
  let signalQuality = 0;
  if (peakIndices.length > 1) {
    // Calculate consistency of peak intervals
    const intervals = [];
    for (let i = 1; i < peakIndices.length; i++) {
      intervals.push(peakIndices[i] - peakIndices[i-1]);
    }
    
    const meanInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const intervalVariation = intervals.map(interval => Math.abs(interval - meanInterval) / meanInterval);
    const avgVariation = intervalVariation.reduce((sum, val) => sum + val, 0) / intervalVariation.length;
    
    // Higher quality = lower variation
    signalQuality = Math.max(0, Math.min(1, 1 - avgVariation));
  }
  
  return { 
    peakIndices, 
    valleyIndices, 
    signalQuality 
  };
}
