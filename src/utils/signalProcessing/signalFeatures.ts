/**
 * Utilities for extracting features from PPG signals
 */

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
 * Calculate RR intervals from peak indices
 */
export const calculateRRIntervals = (peakIndices: number[], sampleRate: number): number[] => {
  const intervals: number[] = [];
  
  for (let i = 1; i < peakIndices.length; i++) {
    const samples = peakIndices[i] - peakIndices[i-1];
    const msec = (samples / sampleRate) * 1000;
    
    // Only include physiologically plausible intervals (30-220 BPM)
    if (msec >= 273 && msec <= 2000) {
      intervals.push(msec);
    }
  }
  
  return intervals;
};

/**
 * Filter out physiologically impossible peaks
 * (e.g., peaks that would indicate a heart rate > 220 bpm)
 */
export const filterSpuriousPeaks = (peakIndices: number[], signal: number[]): number[] => {
  if (peakIndices.length < 2) return peakIndices;
  
  const filteredPeaks: number[] = [peakIndices[0]];
  const minDistance = 8; // Minimum 8 samples between peaks (>220 BPM at 30Hz)
  
  for (let i = 1; i < peakIndices.length; i++) {
    const distance = peakIndices[i] - filteredPeaks[filteredPeaks.length - 1];
    
    if (distance >= minDistance) {
      filteredPeaks.push(peakIndices[i]);
    } else {
      // If peaks are too close, keep only the highest one
      const prevPeakHeight = signal[filteredPeaks[filteredPeaks.length - 1]];
      const currentPeakHeight = signal[peakIndices[i]];
      
      if (currentPeakHeight > prevPeakHeight) {
        // Replace previous peak with current higher peak
        filteredPeaks.pop();
        filteredPeaks.push(peakIndices[i]);
      }
    }
  }
  
  return filteredPeaks;
};
