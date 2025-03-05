
/**
 * Implementation of Pan-Tompkins algorithm for cardiac signal processing
 */

import { applySMAFilter } from './basicFilters';
import { calculateStandardDeviation } from './signalFeatures';

/**
 * Pan-Tompkins QRS Detection Algorithm for ECG signals, adapted for PPG
 * Based on: Pan J, Tompkins WJ. A real-time QRS detection algorithm.
 * IEEE Trans Biomed Eng. 1985;32(3):230-236.
 * 
 * @param signal Array of PPG signal values
 * @returns Object containing peak indices, signal quality, and cardiac features
 */
export const panTompkinsAdaptedForPPG = (signal: number[]): { 
  peakIndices: number[],
  valleyIndices: number[],
  signalQuality: number,
  heartRate: number, 
  rrIntervals: number[] 
} => {
  if (signal.length < 30) {
    return { 
      peakIndices: [], 
      valleyIndices: [], 
      signalQuality: 0, 
      heartRate: 0, 
      rrIntervals: [] 
    };
  }

  // 1. Apply bandpass filter (approximate with MA filters for PPG)
  const lowPassFiltered = applySMAFilter(signal, 7);
  const highPassFiltered = [];
  
  for (let i = 0; i < lowPassFiltered.length; i++) {
    if (i >= 15) {
      highPassFiltered.push(lowPassFiltered[i] - lowPassFiltered[i - 15]);
    } else {
      highPassFiltered.push(lowPassFiltered[i]);
    }
  }
  
  // 2. Derivative - highlight the upward slopes
  const derivative = [];
  for (let i = 2; i < highPassFiltered.length - 2; i++) {
    const deriv = (2 * highPassFiltered[i + 2] + highPassFiltered[i + 1] - 
                   highPassFiltered[i - 1] - 2 * highPassFiltered[i - 2]) / 8;
    derivative.push(deriv);
  }
  
  // 3. Squaring - emphasize higher frequencies
  const squared = derivative.map(val => val * val);
  
  // 4. Moving window integration
  const integrated = applySMAFilter(squared, 15);
  
  // 5. Adaptive thresholding for peak detection
  const peakIndices: number[] = [];
  const valleyIndices: number[] = [];
  
  const mean = integrated.reduce((sum, val) => sum + val, 0) / integrated.length;
  const threshold = mean * 0.6; // Adaptive threshold at 60% of mean
  
  for (let i = 2; i < integrated.length - 2; i++) {
    // Peak detection with dynamic threshold
    if (integrated[i] > threshold &&
        integrated[i] > integrated[i-1] && 
        integrated[i] > integrated[i-2] &&
        integrated[i] > integrated[i+1] && 
        integrated[i] > integrated[i+2]) {
      
      // Adjust peak index to original signal (accounting for derivative window)
      const adjustedIndex = i + 2;
      if (adjustedIndex < signal.length) {
        peakIndices.push(adjustedIndex);
      }
    }
    
    // Valley detection (local minimums)
    if (i > 0 && i < signal.length - 1 &&
        signal[i] < signal[i-1] && 
        signal[i] < signal[i+1]) {
      valleyIndices.push(i);
    }
  }
  
  // Calculate RR intervals (time between peaks)
  const rrIntervals: number[] = [];
  const assumedSampleRate = 30; // assuming 30 Hz sampling rate
  
  for (let i = 1; i < peakIndices.length; i++) {
    const rrInterval = (peakIndices[i] - peakIndices[i-1]) / assumedSampleRate * 1000; // in ms
    if (rrInterval > 300 && rrInterval < 1500) { // Valid values between 40 and 200 BPM
      rrIntervals.push(rrInterval);
    }
  }
  
  // Calculate heart rate from valid RR intervals
  let heartRate = 0;
  if (rrIntervals.length > 0) {
    const avgRR = rrIntervals.reduce((sum, val) => sum + val, 0) / rrIntervals.length;
    heartRate = Math.round(60000 / avgRR); // BPM
  }
  
  // Assess signal quality based on consistency of RR intervals and peak heights
  let signalQuality = 0;
  if (peakIndices.length > 2) {
    // Calculate variation in peak heights
    const peakHeights = peakIndices.map(idx => signal[idx]);
    const peakHeightStdDev = calculateStandardDeviation(peakHeights);
    const peakHeightMean = peakHeights.reduce((sum, val) => sum + val, 0) / peakHeights.length;
    
    // Coefficient of variation - lower is better
    const heightCV = peakHeightStdDev / peakHeightMean;
    
    // Calculate variation in RR intervals
    const rrStdDev = rrIntervals.length > 1 ? calculateStandardDeviation(rrIntervals) : 1000;
    const rrMean = rrIntervals.length > 0 ? 
      rrIntervals.reduce((sum, val) => sum + val, 0) / rrIntervals.length : 1000;
    
    // Coefficient of variation for RR - lower is better (unless arrhythmia)
    const rrCV = rrStdDev / rrMean;
    
    // Combine factors for quality score (0-100)
    const heightQuality = Math.max(0, Math.min(100, 100 * (1 - heightCV)));
    const rrQuality = Math.max(0, Math.min(100, 100 * (1 - rrCV)));
    
    signalQuality = Math.round((heightQuality * 0.4) + (rrQuality * 0.6));
  }
  
  return { 
    peakIndices, 
    valleyIndices,
    signalQuality, 
    heartRate, 
    rrIntervals 
  };
};
