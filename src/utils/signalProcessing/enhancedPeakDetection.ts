
/**
 * Enhanced peak detection algorithm specifically optimized for PPG signals
 */
import { filterSpuriousPeaks, calculateRRIntervals } from './signalFeatures';

/**
 * Advanced peak detection for PPG signals with adaptive thresholding
 * and spurious peak filtering
 */
export const enhancedPeakDetection = (signal: number[]) => {
  if (signal.length < 30) {
    return { 
      peakIndices: [], 
      heartRate: 0, 
      signalQuality: 0 
    };
  }

  // Calculate the signal derivative to enhance peaks
  const derivative = [];
  for (let i = 1; i < signal.length; i++) {
    derivative.push(signal[i] - signal[i - 1]);
  }

  // Smooth derivative slightly
  const smoothedDerivative = [];
  const smoothingWindow = 3;
  for (let i = 0; i < derivative.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - smoothingWindow); j <= Math.min(derivative.length - 1, i + smoothingWindow); j++) {
      sum += derivative[j];
      count++;
    }
    smoothedDerivative.push(sum / count);
  }

  // Find zero crossings from positive to negative (potential peaks)
  const potentialPeakIndices = [];
  for (let i = 1; i < smoothedDerivative.length; i++) {
    if (smoothedDerivative[i - 1] > 0 && smoothedDerivative[i] <= 0) {
      potentialPeakIndices.push(i);
    }
  }

  // Filter out peaks that are too close or too small
  let filteredPeaks = filterSpuriousPeaks(signal, potentialPeakIndices);

  // Calculate signal quality based on consistency of peak intervals
  let signalQuality = 0;
  if (filteredPeaks.length >= 3) {
    const intervals = [];
    for (let i = 1; i < filteredPeaks.length; i++) {
      intervals.push(filteredPeaks[i] - filteredPeaks[i - 1]);
    }
    
    // Calculate coefficient of variation (lower is better)
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1; // Prevent division by zero
    
    // Convert to a 0-100 quality score (inverted and scaled)
    signalQuality = Math.max(0, Math.min(100, 100 * (1 - cv)));
  }

  // Calculate heart rate based on average interval
  const { heartRate } = calculateRRIntervals(filteredPeaks, signal.length, 30); // Assuming 30fps

  return {
    peakIndices: filteredPeaks,
    heartRate,
    signalQuality
  };
};
