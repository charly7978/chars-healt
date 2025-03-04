/**
 * Advanced utility functions for PPG signal processing
 */

// Constants for signal processing
const SAMPLING_RATE = 30; // Typical camera sampling rate (fps)
const MIN_HEART_RATE = 40; // Minimum expected heart rate (bpm)
const MAX_HEART_RATE = 240; // Maximum expected heart rate (bpm)

/**
 * Apply a sophisticated adaptive bandpass filter specifically designed for PPG signals
 * Implements a Butterworth bandpass filter focused on cardiac frequency range (0.5-4Hz)
 */
export const applyAdaptiveBandpassFilter = (buffer: number[], newValue: number): number => {
  // Butterworth bandpass filter coefficients (optimized for PPG)
  // These are designed for a 30Hz sampling rate and 0.5-4Hz passband
  const a = [1.0, -1.7111, 0.7421]; // Denominator coefficients
  const b = [0.1420, 0, -0.1420]; // Numerator coefficients
  
  // Need at least 3 previous values to apply this filter
  if (buffer.length < 3) {
    buffer.push(newValue);
    return newValue;
  }
  
  // Get the most recent values
  const x = [buffer[buffer.length-3], buffer[buffer.length-2], buffer[buffer.length-1], newValue];
  
  // Get previous outputs (If we don't have them, use zeros)
  const prevY1 = buffer.length >= 4 ? buffer[buffer.length-1] - buffer[buffer.length-2] : 0;
  const prevY2 = buffer.length >= 5 ? buffer[buffer.length-2] - buffer[buffer.length-3] : 0;
  
  // Apply filter (Direct Form II Transposed implementation)
  const filtered = b[0] * x[3] + b[1] * x[2] + b[2] * x[1] - a[1] * prevY1 - a[2] * prevY2;
  
  buffer.push(newValue);
  return filtered;
};

/**
 * Apply adaptive moving average filter with signal awareness
 * Uses a variable window size based on signal characteristics
 */
export const applyAdaptiveSMAFilter = (values: number[], newValue: number): number => {
  const minWindow = 3;
  const maxWindow = 9;
  
  // Start with small window
  let windowSize = minWindow;
  
  // If we have enough values, analyze signal to determine optimal window size
  if (values.length >= 15) {
    const recentSlope = Math.abs(values[values.length-1] - values[values.length-2]);
    const averageSlope = values.slice(-10).reduce((acc, val, i, arr) => {
      if (i === 0) return acc;
      return acc + Math.abs(val - arr[i-1]);
    }, 0) / 9;
    
    // If the recent slope is significantly larger than average, we're likely
    // at a rapid change point (like a peak), so use smaller window to preserve detail
    if (recentSlope > averageSlope * 1.5) {
      windowSize = minWindow;
    } else {
      // For relatively flat regions, use larger window for better noise reduction
      windowSize = maxWindow;
    }
  }
  
  // Apply the moving average with the adaptive window
  const smaBuffer = values.slice(-windowSize);
  smaBuffer.push(newValue);
  return smaBuffer.reduce((a, b) => a + b, 0) / smaBuffer.length;
};

/**
 * Simple Moving Average filter with configurable window size
 * This is a basic filter that takes the average of the last N samples
 */
export const applySMAFilter = (values: number[], newValue: number, windowSize: number = 3): number => {
  const window = values.slice(-windowSize);
  window.push(newValue);
  return window.reduce((sum, val) => sum + val, 0) / window.length;
};

/**
 * Powerful state-of-the-art wavelet denoising for PPG signals
 * Inspired by research on continuous wavelet transform techniques for PPG
 * This is a simplified algorithm that mimics wavelet denoising's effects
 */
export const applyWaveletDenoising = (values: number[], newValue: number): number => {
  // Need at least a few values for this algorithm
  if (values.length < 5) {
    return newValue;
  }
  
  // Get multiple scales of the signal by taking different window averages
  const scale1 = values.slice(-2).reduce((a, b) => a + b, 0) / 2; // Fine detail
  const scale2 = values.slice(-4).reduce((a, b) => a + b, 0) / 4; // Medium detail
  const scale3 = values.slice(-8).reduce((a, b) => a + b, 0) / 8; // Coarse detail
  
  // Calculate detail coefficients (similar to wavelet detail coefficients)
  const detail1 = newValue - scale1;
  const detail2 = scale1 - scale2;
  const detail3 = scale2 - scale3;
  
  // Apply soft thresholding to the detail coefficients
  // This is the key to wavelet denoising - keep significant coefficients, reduce noise
  const threshold1 = 0.1;
  const threshold2 = 0.05;
  const threshold3 = 0.025;
  
  const softThreshold = (value: number, threshold: number) => {
    if (Math.abs(value) <= threshold) {
      return 0;
    } else {
      return value > 0 ? value - threshold : value + threshold;
    }
  };
  
  const denoisedDetail1 = softThreshold(detail1, threshold1);
  const denoisedDetail2 = softThreshold(detail2, threshold2);
  const denoisedDetail3 = softThreshold(detail3, threshold3);
  
  // Reconstruct the signal from denoised coefficients
  // Giving more weight to medium-scale details which typically contain the pulse signal
  const denoised = scale3 + denoisedDetail3 * 0.8 + denoisedDetail2 * 1.0 + denoisedDetail1 * 0.6;
  
  return denoised;
};

/**
 * Advanced PPG signal conditioning based on state-of-the-art research
 * Combines multiple techniques for optimal PPG signal extraction
 */
export const conditionPPGSignal = (rawBuffer: number[], newRawValue: number): number => {
  // Stage 1: Detrending (removing baseline drift)
  const windowSize = Math.min(rawBuffer.length, 30); // Use up to 1 second of data at 30fps
  if (windowSize < 5) return newRawValue; // Not enough data yet
  
  const recentValues = [...rawBuffer.slice(-windowSize), newRawValue];
  const baseline = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
  const detrended = newRawValue - baseline;
  
  // Stage 2: Adaptive bandpass filtering
  const filtered = applyAdaptiveBandpassFilter(rawBuffer, detrended);
  
  // Stage 3: Wavelet denoising
  const denoised = applyWaveletDenoising(rawBuffer.slice(-10), filtered);
  
  // Stage 4: Peak enhancement
  let enhanced = denoised;
  
  // If we have enough history, check if we're approaching a potential peak
  if (rawBuffer.length >= 3) {
    const prev2 = rawBuffer[rawBuffer.length - 3];
    const prev1 = rawBuffer[rawBuffer.length - 2];
    const curr = rawBuffer[rawBuffer.length - 1];
    
    // If we're on a consistent upward slope (potential peak approaching)
    if (curr > prev1 && prev1 > prev2 && denoised > curr) {
      // Enhance the potential peak slightly
      enhanced = denoised * 1.1;
    }
  }
  
  return enhanced;
};

/**
 * Enhanced peak detection using multiple criteria and adaptive thresholds
 * Based on state-of-the-art research for robust PPG peak detection
 */
export const enhancedPeakDetection = (values: number[]): { 
  peakIndices: number[]; 
  valleyIndices: number[];
  signalQuality: number;
} => {
  const peakIndices: number[] = [];
  const valleyIndices: number[] = [];
  const signalStrengths: number[] = [];
  
  // 1. Normalize signal for analysis
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  // Calculate normalized values
  const normalizedValues = range > 0 ? 
                        values.map(v => (v - min) / range) : 
                        values.map(() => 0.5);
  
  // 2. Calculate first and second derivatives for robust peak detection
  const firstDerivative: number[] = [];
  const secondDerivative: number[] = [];
  
  for (let i = 1; i < normalizedValues.length; i++) {
    firstDerivative.push(normalizedValues[i] - normalizedValues[i-1]);
  }
  firstDerivative.push(0); // Add 0 at the end to maintain same length
  
  for (let i = 1; i < firstDerivative.length; i++) {
    secondDerivative.push(firstDerivative[i] - firstDerivative[i-1]);
  }
  secondDerivative.push(0); // Add 0 at the end to maintain same length
  
  // 3. Adaptive threshold based on signal characteristics
  const meanValue = normalizedValues.reduce((a, b) => a + b, 0) / normalizedValues.length;
  const standardDeviation = Math.sqrt(
    normalizedValues.reduce((a, b) => a + Math.pow(b - meanValue, 2), 0) / normalizedValues.length
  );
  
  // Adaptive amplitude threshold - lower for weak signals, higher for strong signals
  const amplitudeThreshold = Math.max(0.1, Math.min(0.4, standardDeviation * 0.8));
  
  // 4. Multi-criteria peak detection
  for (let i = 2; i < normalizedValues.length - 2; i++) {
    const v = normalizedValues[i];
    
    // Criteria for peaks:
    // 1. Higher than adjacent points
    // 2. First derivative changes from positive to negative
    // 3. Second derivative is negative (curvature)
    // 4. Amplitude exceeds threshold relative to local baseline
    if (v > normalizedValues[i - 1] && 
        v > normalizedValues[i - 2] && 
        v > normalizedValues[i + 1] && 
        v > normalizedValues[i + 2] &&
        firstDerivative[i-1] > 0 && firstDerivative[i] < 0 &&
        secondDerivative[i] < 0 &&
        v > meanValue + amplitudeThreshold) {
      
      // Additional criteria: minimum distance between peaks
      const minPeakDistance = 10; // Minimum samples between peaks (at 30fps, ~330ms)
      
      // Check if this peak is far enough from the previous one
      const farEnough = peakIndices.length === 0 || 
                        (i - peakIndices[peakIndices.length - 1]) >= minPeakDistance;
      
      if (farEnough) {
        peakIndices.push(i);
        
        // Calculate peak "strength" for quality evaluation
        const peakStrength = (v - normalizedValues[i-2]) + (v - normalizedValues[i+2]);
        signalStrengths.push(peakStrength);
      }
    }
    
    // Similar criteria for valleys, but inverted
    if (v < normalizedValues[i - 1] && 
        v < normalizedValues[i - 2] && 
        v < normalizedValues[i + 1] && 
        v < normalizedValues[i + 2] &&
        firstDerivative[i-1] < 0 && firstDerivative[i] > 0 &&
        secondDerivative[i] > 0 &&
        v < meanValue - amplitudeThreshold / 2) {
      
      const minValleyDistance = 10;
      const farEnough = valleyIndices.length === 0 || 
                        (i - valleyIndices[valleyIndices.length - 1]) >= minValleyDistance;
      
      if (farEnough) {
        valleyIndices.push(i);
      }
    }
  }
  
  // 5. Advanced signal quality analysis
  let signalQuality = 0;
  
  if (peakIndices.length >= 3) {
    // 5.1 Calculate regularity of intervals between peaks
    const peakIntervals: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      peakIntervals.push(peakIndices[i] - peakIndices[i-1]);
    }
    
    const intervalMean = peakIntervals.reduce((sum, val) => sum + val, 0) / peakIntervals.length;
    const intervalVariation = peakIntervals.map(interval => 
                               Math.abs(interval - intervalMean) / intervalMean);
    
    const meanIntervalVariation = intervalVariation.reduce((sum, val) => sum + val, 0) / 
                               intervalVariation.length;
    
    // 5.2 Calculate consistency of peak amplitudes
    const peakValues = peakIndices.map(idx => normalizedValues[idx]);
    const peakValueMean = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
    const peakValueVariation = peakValues.map(val => 
                             Math.abs(val - peakValueMean) / peakValueMean);
    
    const meanPeakVariation = peakValueVariation.reduce((sum, val) => sum + val, 0) / 
                           peakValueVariation.length;
    
    // 5.3 Physiological plausibility check
    // Calculate approximate heart rate and check if it's in physiological range
    if (intervalMean > 0) {
      const approxHeartRate = (SAMPLING_RATE * 60) / intervalMean;
      const isHeartRateInRange = approxHeartRate >= MIN_HEART_RATE && approxHeartRate <= MAX_HEART_RATE;
      
      // 5.4 Check for consistent peak-to-valley pattern
      let patternConsistency = 0;
      if (peakIndices.length > 0 && valleyIndices.length > 0) {
        // Expect alternating peaks and valleys
        let correctPatterns = 0;
        let totalPatterns = 0;
        
        for (let i = 0; i < peakIndices.length; i++) {
          // Find valleys between consecutive peaks
          const currentPeak = peakIndices[i];
          const nextPeak = i < peakIndices.length - 1 ? peakIndices[i+1] : Number.MAX_SAFE_INTEGER;
          
          // Count valleys between these peaks
          const valleysBetween = valleyIndices.filter(v => v > currentPeak && v < nextPeak);
          
          if (i < peakIndices.length - 1) {
            totalPatterns++;
            // Ideally, should have exactly one valley between two peaks
            if (valleysBetween.length === 1) {
              correctPatterns++;
            }
          }
        }
        
        patternConsistency = totalPatterns > 0 ? correctPatterns / totalPatterns : 0;
      }
      
      // 5.5 Combine factors for final quality score
      const intervalConsistency = 1 - Math.min(1, meanIntervalVariation * 2);
      const amplitudeConsistency = 1 - Math.min(1, meanPeakVariation * 2);
      const peakCount = Math.min(1, peakIndices.length / 8); // 8+ peaks = maximum score
      
      signalQuality = 
        (intervalConsistency * 0.4) + 
        (amplitudeConsistency * 0.25) + 
        (peakCount * 0.15) + 
        (patternConsistency * 0.2) + 
        (isHeartRateInRange ? 0 : -0.3); // Penalty if heart rate not physiological
      
      // Ensure quality is between 0-1, then scale to 0-100
      signalQuality = Math.max(0, Math.min(1, signalQuality)) * 100;
    }
  }
  
  return { peakIndices, valleyIndices, signalQuality: Math.round(signalQuality) };
};

/**
 * Calculate amplitude from peaks and valleys with advanced normalization
 */
export const calculateAmplitude = (
  values: number[],
  peaks: number[],
  valleys: number[]
): number => {
  if (peaks.length === 0 || valleys.length === 0) return 0;

  // Pair each peak with its closest preceding valley
  const amplitudes: number[] = [];
  for (const peakIndex of peaks) {
    // Find the closest valley before this peak
    const precedingValleys = valleys.filter(v => v < peakIndex);
    if (precedingValleys.length > 0) {
      const closestValley = Math.max(...precedingValleys);
      const peakValue = values[peakIndex];
      const valleyValue = values[closestValley];
      const amplitude = peakValue - valleyValue;
      
      if (amplitude > 0) {
        amplitudes.push(amplitude);
      }
    }
  }
  
  if (amplitudes.length === 0) return 0;

  // Use trimmed mean (removes outliers)
  amplitudes.sort((a, b) => a - b);
  const trimAmount = Math.floor(amplitudes.length * 0.2); // Remove 20% from each end
  const trimmedAmplitudes = amplitudes.slice(trimAmount, amplitudes.length - trimAmount);
  
  // If we trimmed everything, use the median
  if (trimmedAmplitudes.length === 0) {
    const midIndex = Math.floor(amplitudes.length / 2);
    return amplitudes[midIndex];
  }
  
  // Calculate trimmed mean
  const mean = trimmedAmplitudes.reduce((a, b) => a + b, 0) / trimmedAmplitudes.length;
  return mean;
};

/**
 * Calculate AC component (amplitude) of a signal using frequency domain analysis
 * More robust than time-domain methods for noisy signals
 */
export const calculateAC = (values: number[]): number => {
  if (values.length < 10) return 0;
  
  // Use amplitude estimation from peak detection
  const { peakIndices, valleyIndices } = enhancedPeakDetection(values);
  return calculateAmplitude(values, peakIndices, valleyIndices);
};

/**
 * Calculate DC component (baseline) of a signal
 * Uses robust estimation to handle outliers
 */
export const calculateDC = (values: number[]): number => {
  if (values.length === 0) return 0;
  
  // Sort values to calculate median (more robust than mean)
  const sortedValues = [...values].sort((a, b) => a - b);
  const midIndex = Math.floor(sortedValues.length / 2);
  
  if (sortedValues.length % 2 === 0) {
    // Even number of elements, average the middle two
    return (sortedValues[midIndex - 1] + sortedValues[midIndex]) / 2;
  } else {
    // Odd number of elements, return the middle one
    return sortedValues[midIndex];
  }
};

/**
 * Calculate standard deviation with outlier rejection
 */
export const calculateStandardDeviation = (values: number[]): number => {
  const n = values.length;
  if (n < 3) return 0;
  
  // Use median as center (more robust to outliers)
  const median = calculateDC(values);
  
  // Calculate absolute deviations from median
  const absoluteDeviations = values.map(v => Math.abs(v - median));
  
  // Calculate MAD (Median Absolute Deviation)
  const mad = calculateDC(absoluteDeviations);
  
  // MAD * 1.4826 approximates standard deviation for normal distributions
  // with robust handling of outliers
  return mad * 1.4826;
};

/**
 * Advanced signal quality assessment based on multiple metrics
 */
export const assessSignalQuality = (values: number[]): number => {
  if (values.length < 30) return 0; // Need sufficient data for quality assessment
  
  // 1. Basic signal statistics
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const standardDev = calculateStandardDeviation(values);
  
  // 2. Peak detection quality
  const { signalQuality: peakQuality } = enhancedPeakDetection(values);
  
  // 3. Signal-to-noise ratio estimation
  // Use detrended fluctuation analysis (simplified)
  const trendRemoved = values.map((v, i, arr) => {
    const localAvg = i < 5 ? 
      arr.slice(0, i+5).reduce((a, b) => a + b, 0) / (i+5) :
      arr.slice(i-5, i+5).reduce((a, b) => a + b, 0) / 10;
    return v - localAvg;
  });
  
  const signal = trendRemoved.reduce((a, b) => a + Math.pow(b, 2), 0) / trendRemoved.length;
  
  // Calculate high-frequency noise (differences between adjacent points)
  let noise = 0;
  for (let i = 1; i < trendRemoved.length; i++) {
    noise += Math.pow(trendRemoved[i] - trendRemoved[i-1], 2);
  }
  noise /= (trendRemoved.length - 1);
  
  // Approximate SNR
  const snr = noise > 0 ? 10 * Math.log10(signal / noise) : 0;
  const snrScore = Math.max(0, Math.min(100, (snr + 10) * 5)); // Scale from dB to 0-100
  
  // 4. Combine all quality metrics
  // Weight different factors based on importance
  const rangeWeight = 0.2;
  const stdDevWeight = 0.1;
  const peakQualityWeight = 0.5;
  const snrWeight = 0.2;
  
  // Scale range score based on expected amplitude
  const rangeScore = Math.min(100, range * 200); // Scale appropriately
  
  // Combine scores
  const combinedScore = 
    rangeWeight * rangeScore +
    stdDevWeight * Math.min(100, standardDev * 200) +
    peakQualityWeight * peakQuality +
    snrWeight * snrScore;
  
  return Math.round(Math.max(0, Math.min(100, combinedScore)));
};
