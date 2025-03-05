/**
 * Utilities for extracting features from PPG signals
 */

/**
 * Calculate the AC component of a PPG signal
 * @param signal The PPG signal array
 * @returns The AC component value
 */
export const calculateAC = (signal: number[]): number => {
  if (signal.length === 0) return 0;
  
  const min = Math.min(...signal);
  const max = Math.max(...signal);
  return max - min;
};

/**
 * Calculate the DC component of a PPG signal
 * @param signal The PPG signal array
 * @returns The DC component value
 */
export const calculateDC = (signal: number[]): number => {
  if (signal.length === 0) return 0;
  
  const sum = signal.reduce((acc, val) => acc + val, 0);
  return sum / signal.length;
};

/**
 * Calculate standard deviation of an array of numbers
 * @param values Array of numeric values
 * @returns Standard deviation
 */
export const calculateStandardDeviation = (values: number[]): number => {
  if (values.length < 2) return 0;
  
  const avg = values.reduce((acc, val) => acc + val, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((acc, val) => acc + val, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
};

/**
 * Filter out spurious peaks based on minimum distance and height criteria
 * @param signal Original signal
 * @param peakIndices Array of potential peak indices
 * @returns Filtered array of peak indices
 */
export const filterSpuriousPeaks = (signal: number[], peakIndices: number[]): number[] => {
  if (peakIndices.length <= 1) return peakIndices;
  
  const filteredPeaks: number[] = [];
  let lastValidPeak = peakIndices[0];
  filteredPeaks.push(lastValidPeak);
  
  // Minimum distance between peaks (in samples) - adapt based on expected HR range
  const minPeakDistance = 15; // At 30fps, this represents 120 BPM max
  
  for (let i = 1; i < peakIndices.length; i++) {
    const currentPeak = peakIndices[i];
    const distance = currentPeak - lastValidPeak;
    
    if (distance >= minPeakDistance) {
      filteredPeaks.push(currentPeak);
      lastValidPeak = currentPeak;
    } else {
      // If peaks are too close, keep the higher one
      if (signal[currentPeak] > signal[lastValidPeak]) {
        filteredPeaks.pop(); // Remove last peak
        filteredPeaks.push(currentPeak); // Add current peak
        lastValidPeak = currentPeak;
      }
    }
  }
  
  return filteredPeaks;
};

/**
 * Calculate RR intervals and heart rate from peak indices
 * @param peakIndices Array of peak indices
 * @param signalLength Total length of the original signal
 * @param samplingRate Sampling rate in Hz
 * @returns Object with RR intervals and calculated heart rate
 */
export const calculateRRIntervals = (
  peakIndices: number[],
  signalLength: number,
  samplingRate: number = 30
): { intervals: number[], heartRate: number } => {
  if (peakIndices.length < 2) {
    return { intervals: [], heartRate: 0 };
  }
  
  // Calculate intervals between consecutive peaks (in samples)
  const intervals: number[] = [];
  for (let i = 1; i < peakIndices.length; i++) {
    intervals.push(peakIndices[i] - peakIndices[i - 1]);
  }
  
  // Convert intervals from samples to seconds
  const intervalsSec = intervals.map(interval => interval / samplingRate);
  
  // Calculate average interval in seconds
  const avgIntervalSec = intervalsSec.reduce((sum, val) => sum + val, 0) / intervalsSec.length;
  
  // Calculate heart rate (beats per minute)
  const heartRate = avgIntervalSec > 0 ? 60 / avgIntervalSec : 0;
  
  return { intervals, heartRate };
};
