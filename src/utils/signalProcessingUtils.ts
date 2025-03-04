
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
 * Calculates the AC component (alternating current) of a PPG signal
 * @param values PPG signal values
 * @returns AC component value
 */
export const calculateAC = (values: number[]): number => {
  if (values.length < 2) return 0;
  
  // AC is the peak-to-peak amplitude (max - min)
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max - min;
};

/**
 * Calculates the DC component (direct current) of a PPG signal
 * @param values PPG signal values
 * @returns DC component value
 */
export const calculateDC = (values: number[]): number => {
  if (values.length === 0) return 0;
  
  // DC is the mean value of the signal
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
};

/**
 * Calculates standard deviation of a signal
 * @param values Array of values
 * @returns Standard deviation value
 */
export const calculateStandardDeviation = (values: number[]): number => {
  if (values.length <= 1) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  
  return Math.sqrt(variance);
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
 * Enhances peak detection in the PPG signal
 * @param signal Array of PPG signal values
 * @returns Object containing peak indices and signal quality
 */
export const enhancedPeakDetection = (signal: number[]): { peakIndices: number[], valleyIndices: number[], signalQuality: number } => {
  const peakIndices: number[] = [];
  const valleyIndices: number[] = [];
  
  // Basic peak detection logic (you may need to adjust thresholds)
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      peakIndices.push(i);
    }
    if (signal[i] < signal[i - 1] && signal[i] < signal[i + 1]) {
      valleyIndices.push(i);
    }
  }
  
  // Assess signal quality based on peak characteristics
  const signalQuality = assessSignalQuality(signal, peakIndices);
  
  return { peakIndices, valleyIndices, signalQuality };
};

/**
 * Assesses the quality of the PPG signal based on peak characteristics
 * @param signal Array of PPG signal values
 * @param peakIndices Array of peak indices
 * @returns Signal quality score (0-100)
 */
export const assessSignalQuality = (signal: number[], peakIndices: number[]): number => {
  if (signal.length === 0) {
    return 0; // No signal data
  }
  
  const numPeaks = peakIndices.length;
  
  // Calculate the average peak height
  let avgPeakHeight = 0;
  if (numPeaks > 0) {
    let totalPeakHeight = 0;
    for (const peakIndex of peakIndices) {
      totalPeakHeight += signal[peakIndex];
    }
    avgPeakHeight = totalPeakHeight / numPeaks;
  }
  
  // Calculate the standard deviation of peak heights
  let stdDevPeakHeight = 0;
  if (numPeaks > 0) {
    let sumOfSquares = 0;
    for (const peakIndex of peakIndices) {
      sumOfSquares += Math.pow(signal[peakIndex] - avgPeakHeight, 2);
    }
    stdDevPeakHeight = Math.sqrt(sumOfSquares / numPeaks);
  }
  
  // Calculate the signal-to-noise ratio (SNR)
  let snr = 0;
  if (stdDevPeakHeight > 0) {
    snr = avgPeakHeight / stdDevPeakHeight;
  }
  
  // Normalize the SNR to a 0-100 scale
  const qualityScore = Math.min(100, Math.max(0, snr * 20)); // Adjust scaling factor as needed
  
  return qualityScore;
};
