
/**
 * Basic signal filtering utilities
 */

/**
 * Applies a Simple Moving Average filter to smooth a signal
 * @param signal Input signal array
 * @param windowSize Size of the moving window
 * @returns Filtered signal
 */
export const applySMAFilter = (signal: number[], windowSize: number = 5): number[] => {
  if (signal.length < windowSize) {
    return [...signal]; // Not enough data to filter
  }
  
  const result: number[] = [];
  
  for (let i = 0; i < signal.length; i++) {
    if (i < windowSize - 1) {
      // For the first windowSize-1 points, use as many points as available
      const windowStart = 0;
      const windowEnd = i + 1;
      const windowSlice = signal.slice(windowStart, windowEnd);
      const avg = windowSlice.reduce((sum, val) => sum + val, 0) / windowSlice.length;
      result.push(avg);
    } else {
      // Use full window
      const windowStart = i - windowSize + 1;
      const windowSlice = signal.slice(windowStart, i + 1);
      const avg = windowSlice.reduce((sum, val) => sum + val, 0) / windowSize;
      result.push(avg);
    }
  }
  
  return result;
};

/**
 * Alternative SMA implementation for single value processing
 * @param values Previous values
 * @param newValue New value to add
 * @param windowSize Window size
 * @returns Smoothed value
 */
export const applySMAFilterSingle = (values: number[], newValue: number, windowSize: number = 5): number => {
  const combinedValues = [...values.slice(-windowSize + 1), newValue];
  return combinedValues.reduce((sum, val) => sum + val, 0) / combinedValues.length;
};

/**
 * Conditions the PPG signal to reduce noise and improve peak detection
 * @param signal Array of raw PPG signal values
 * @param rawValue Current raw PPG value
 * @returns Enhanced PPG signal value
 */
export const conditionPPGSignal = (signal: number[], rawValue: number): number => {
  // Apply a simple moving average filter to smooth the signal
  const smoothedSignal = applySMAFilter(signal, 5);
  
  // Use the latest smoothed value as the enhanced value
  const enhancedValue = smoothedSignal.length > 0 ? smoothedSignal[smoothedSignal.length - 1] : rawValue;
  
  return enhancedValue;
};

/**
 * Wavelet-inspired denoising algorithm to remove high-frequency noise
 * while preserving relevant cardiac signal features
 */
export const waveletDenoise = (signal: number[]): number[] => {
  // Simplified wavelet-inspired denoising
  const result: number[] = [];
  
  // Apply multi-scale averaging (simulating wavelet decomposition)
  for (let i = 0; i < signal.length; i++) {
    const scales: number[] = [];
    
    // Scale 1 (minimal smoothing)
    scales.push(applySMAFilterSingle(
      signal.slice(Math.max(0, i - 2), i),
      signal[i],
      3
    ));
    
    // Scale 2 (medium smoothing)
    scales.push(applySMAFilterSingle(
      signal.slice(Math.max(0, i - 4), i),
      signal[i],
      5
    ));
    
    // Scale 3 (high smoothing)
    scales.push(applySMAFilterSingle(
      signal.slice(Math.max(0, i - 7), i),
      signal[i],
      9
    ));
    
    // Weighted average of scales (prioritizing less smoothed signals)
    const denoised = (scales[0] * 0.6) + (scales[1] * 0.3) + (scales[2] * 0.1);
    result.push(denoised);
  }
  
  return result;
};
