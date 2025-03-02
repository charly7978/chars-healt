/**
 * Signal processing utility functions
 */

/**
 * Apply Simple Moving Average filter to signal
 */
export const applySMAFilter = (
  values: number[],
  newValue: number,
  windowSize: number = 3
): number => {
  const window = [...values.slice(-windowSize), newValue];
  const sum = window.reduce((acc, val) => acc + val, 0);
  return sum / window.length;
};

/**
 * Calculate DC component of a signal (average)
 */
export const calculateDC = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

/**
 * Calculate AC component of a signal (peak-to-peak amplitude)
 */
export const calculateAC = (values: number[]): number => {
  if (values.length === 0) return 0;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max - min;
};

/**
 * Calculate Standard Deviation of a signal
 */
export const calculateStandardDeviation = (values: number[]): number => {
  if (values.length <= 1) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
  
  return Math.sqrt(variance);
};

/**
 * Enhanced Peak Detection with signal quality assessment
 */
export const enhancedPeakDetection = (values: number[]): {
  peakIndices: number[];
  valleyIndices: number[];
  signalQuality: number;
} => {
  if (values.length < 10) {
    return {
      peakIndices: [],
      valleyIndices: [],
      signalQuality: 0
    };
  }
  
  try {
    // Signal preprocessing
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Dynamic threshold based on signal amplitude
    const max = Math.max(...values);
    const min = Math.min(...values);
    const amplitude = max - min;
    
    // Use a percentage of amplitude for peak detection
    const peakThreshold = mean + (amplitude * 0.3);
    const valleyThreshold = mean - (amplitude * 0.3);
    
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];
    
    // Basic peak detection with minimal separation criteria
    const minPeakDistance = 4; // Minimum samples between peaks
    
    for (let i = 2; i < values.length - 2; i++) {
      // Check for peaks
      if (values[i] > peakThreshold && 
          values[i] > values[i-1] && 
          values[i] > values[i-2] &&
          values[i] > values[i+1] &&
          values[i] > values[i+2]) {
        
        // Only add if it's far enough from the previous peak
        if (peakIndices.length === 0 || i - peakIndices[peakIndices.length - 1] >= minPeakDistance) {
          peakIndices.push(i);
        } else {
          // If we have two close peaks, keep the higher one
          const prevPeakIdx = peakIndices[peakIndices.length - 1];
          if (values[i] > values[prevPeakIdx]) {
            peakIndices[peakIndices.length - 1] = i;
          }
        }
      }
      
      // Check for valleys
      if (values[i] < valleyThreshold && 
          values[i] < values[i-1] && 
          values[i] < values[i-2] &&
          values[i] < values[i+1] &&
          values[i] < values[i+2]) {
        
        // Similar logic for minimum valley distance
        if (valleyIndices.length === 0 || i - valleyIndices[valleyIndices.length - 1] >= minPeakDistance) {
          valleyIndices.push(i);
        } else {
          // For valleys, keep the lower one
          const prevValleyIdx = valleyIndices[valleyIndices.length - 1];
          if (values[i] < values[prevValleyIdx]) {
            valleyIndices[valleyIndices.length - 1] = i;
          }
        }
      }
    }
    
    // Calculate signal quality metrics
    
    // 1. Peak-to-valley amplitude consistency
    let amplitudeConsistency = 1.0;
    const peakToValleyAmplitudes: number[] = [];
    
    // Map peaks to nearest valleys to measure amplitudes
    for (const peakIdx of peakIndices) {
      // Find closest valley before and after this peak
      const prevValley = valleyIndices.filter(v => v < peakIdx).pop();
      const nextValley = valleyIndices.find(v => v > peakIdx);
      
      if (prevValley !== undefined) {
        peakToValleyAmplitudes.push(values[peakIdx] - values[prevValley]);
      }
      
      if (nextValley !== undefined) {
        peakToValleyAmplitudes.push(values[peakIdx] - values[nextValley]);
      }
    }
    
    if (peakToValleyAmplitudes.length >= 2) {
      const ampMean = peakToValleyAmplitudes.reduce((sum, val) => sum + val, 0) / peakToValleyAmplitudes.length;
      const ampStdDev = Math.sqrt(
        peakToValleyAmplitudes.reduce((sum, val) => sum + Math.pow(val - ampMean, 2), 0) / peakToValleyAmplitudes.length
      );
      const ampCV = ampStdDev / (ampMean || 1); // Coefficient of variation (lower is better)
      amplitudeConsistency = Math.max(0, Math.min(1, 1 - ampCV));
    }
    
    // 2. Periodicity - consistency of peak-to-peak intervals
    let periodConsistency = 1.0;
    const intervals: number[] = [];
    
    for (let i = 1; i < peakIndices.length; i++) {
      intervals.push(peakIndices[i] - peakIndices[i-1]);
    }
    
    if (intervals.length >= 2) {
      const intMean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const intStdDev = Math.sqrt(
        intervals.reduce((sum, val) => sum + Math.pow(val - intMean, 2), 0) / intervals.length
      );
      const intCV = intStdDev / (intMean || 1);
      periodConsistency = Math.max(0, Math.min(1, 1 - intCV));
    }
    
    // 3. Signal-to-noise ratio estimation
    let snrEstimate = 0.5; // Default medium quality
    
    // Calculate noise by looking at small variations between samples
    const differences: number[] = [];
    for (let i = 1; i < values.length; i++) {
      differences.push(Math.abs(values[i] - values[i-1]));
    }
    
    if (differences.length > 0 && amplitude > 0) {
      const avgDiff = differences.reduce((sum, val) => sum + val, 0) / differences.length;
      // Noise-to-signal ratio (lower is better)
      const noiseRatio = avgDiff / amplitude;
      // Convert to SNR (higher is better)
      snrEstimate = Math.max(0, Math.min(1, 1 - (noiseRatio * 5)));
    }
    
    // Combine metrics for overall quality score (0-1)
    const signalQuality = (
      (amplitudeConsistency * 0.4) + 
      (periodConsistency * 0.4) + 
      (snrEstimate * 0.2)
    );
    
    return {
      peakIndices,
      valleyIndices,
      signalQuality: parseFloat(signalQuality.toFixed(2))
    };
    
  } catch (error) {
    console.error("Error in enhanced peak detection:", error);
    return {
      peakIndices: [],
      valleyIndices: [],
      signalQuality: 0
    };
  }
};

/**
 * Analyze cardiac waveform properties
 */
export const analyzeCardiacWaveform = (values: number[]) => {
  if (values.length < 30) {
    return {
      periodicity: 0,
      amplitude: 0,
      noiseRatio: 0,
      regularityScore: 0,
      waveQuality: 0
    };
  }
  
  try {
    // Calculate base metrics
    const max = Math.max(...values);
    const min = Math.min(...values);
    const amplitude = max - min;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Measure noise through standard deviation of differences
    const differences = [];
    for (let i = 1; i < values.length; i++) {
      differences.push(Math.abs(values[i] - values[i-1]));
    }
    
    const diffMean = differences.reduce((sum, val) => sum + val, 0) / differences.length;
    const diffVariance = differences.reduce((sum, val) => sum + Math.pow(val - diffMean, 2), 0) / differences.length;
    const diffStdDev = Math.sqrt(diffVariance);
    
    // Calculate noise ratio - higher values mean more noise
    const noiseRatio = diffStdDev / (amplitude || 1);
    
    // Detect peaks for periodicity analysis
    const peaks = [];
    const threshold = mean + (amplitude * 0.3);
    
    for (let i = 2; i < values.length - 2; i++) {
      if (values[i] > threshold && 
          values[i] > values[i-1] && 
          values[i] > values[i-2] &&
          values[i] > values[i+1] &&
          values[i] > values[i+2]) {
        peaks.push(i);
      }
    }
    
    // Calculate peak intervals
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i-1]);
    }
    
    // Periodicity score based on consistency of intervals
    let periodicity = 0;
    if (intervals.length >= 2) {
      const intervalMean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const intervalVariance = intervals.reduce((sum, val) => sum + Math.pow(val - intervalMean, 2), 0) / intervals.length;
      const intervalCV = Math.sqrt(intervalVariance) / intervalMean;
      
      // Lower coefficient of variation means more consistent intervals
      periodicity = Math.min(1, Math.max(0, 1 - intervalCV));
    }
    
    // Calculate regularity score based on amplitude consistency
    const peakValues = peaks.map(idx => values[idx]);
    let regularityScore = 0;
    
    if (peakValues.length >= 2) {
      const peakMean = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
      const peakVariance = peakValues.reduce((sum, val) => sum + Math.pow(val - peakMean, 2), 0) / peakValues.length;
      const peakCV = Math.sqrt(peakVariance) / peakMean;
      
      // Lower coefficient of variation means more consistent peak heights
      regularityScore = Math.min(1, Math.max(0, 1 - peakCV));
    }
    
    // Calculate overall waveform quality
    const noiseScore = Math.max(0, 1 - (noiseRatio * 5)); // Penalize noise heavily
    const waveQuality = (
      (periodicity * 0.4) + 
      (regularityScore * 0.3) + 
      (noiseScore * 0.3)
    );
    
    return {
      periodicity: parseFloat(periodicity.toFixed(2)),
      amplitude: parseFloat(amplitude.toFixed(2)),
      noiseRatio: parseFloat(noiseRatio.toFixed(3)),
      regularityScore: parseFloat(regularityScore.toFixed(2)),
      waveQuality: parseFloat(waveQuality.toFixed(2))
    };
  } catch (error) {
    console.error('Error analyzing cardiac waveform:', error);
    return {
      periodicity: 0,
      amplitude: 0,
      noiseRatio: 1,
      regularityScore: 0,
      waveQuality: 0
    };
  }
};
