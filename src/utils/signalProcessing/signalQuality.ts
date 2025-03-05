
/**
 * Utilities for assessing signal quality and reliability
 */

import { calculateStandardDeviation } from './signalFeatures';

/**
 * Assess signal quality based on multiple factors
 * @returns Signal quality score (0-100)
 */
export const assessSignalQuality = (signal: number[], peakIndices: number[], rrIntervals?: number[]): number => {
  if (signal.length === 0 || peakIndices.length < 3) {
    return 0; // Not enough data for quality assessment
  }
  
  // Factor 1: Consistency of peak heights (25%)
  const peakHeights = peakIndices.map(i => signal[i]);
  const heightStdDev = calculateStandardDeviation(peakHeights);
  const heightMean = peakHeights.reduce((sum, val) => sum + val, 0) / peakHeights.length;
  const heightCV = heightMean > 0 ? heightStdDev / heightMean : 1; // Coefficient of variation
  const heightConsistency = Math.max(0, Math.min(100, 100 * (1 - heightCV)));
  
  // Factor 2: Signal-to-noise ratio approximation (25%)
  const signalPower = peakHeights.reduce((sum, val) => sum + (val * val), 0) / peakHeights.length;
  const noiseEstimate = signal.reduce((sum, val) => sum + (val * val), 0) / signal.length;
  const snr = signalPower > 0 && noiseEstimate > 0 ? 10 * Math.log10(signalPower / noiseEstimate) : 0;
  const snrScore = Math.max(0, Math.min(100, snr * 10)); // Scale snr to 0-100
  
  // Factor 3: Regularity of RR intervals (30%)
  let rrRegularity = 0;
  if (rrIntervals && rrIntervals.length >= 3) {
    const rrStdDev = calculateStandardDeviation(rrIntervals);
    const rrMean = rrIntervals.reduce((sum, val) => sum + val, 0) / rrIntervals.length;
    const rrCV = rrMean > 0 ? rrStdDev / rrMean : 1;
    rrRegularity = Math.max(0, Math.min(100, 100 * (1 - rrCV)));
  }
  
  // Factor 4: Physiological plausibility (20%)
  let plausibilityScore = 0;
  if (rrIntervals && rrIntervals.length > 0) {
    const avgRR = rrIntervals.reduce((sum, val) => sum + val, 0) / rrIntervals.length;
    const hr = 60000 / avgRR;
    
    // Higher score for heart rates in the normal range (60-100 bpm)
    if (hr >= 60 && hr <= 100) {
      plausibilityScore = 100;
    } else if (hr > 100 && hr <= 150) {
      plausibilityScore = 100 - ((hr - 100) * 1.2); // Linear decrease to ~40 at 150 bpm
    } else if (hr >= 40 && hr < 60) {
      plausibilityScore = 100 - ((60 - hr) * 3); // Linear decrease to ~40 at 40 bpm
    } else {
      plausibilityScore = Math.max(0, 30 - Math.abs(hr - 75) * 0.5); // Low score for extreme values
    }
  }
  
  // Weighted final score
  const weightedScore = (
    (heightConsistency * 0.25) +
    (snrScore * 0.25) +
    (rrRegularity * 0.3) +
    (plausibilityScore * 0.2)
  );
  
  return Math.round(weightedScore);
};
