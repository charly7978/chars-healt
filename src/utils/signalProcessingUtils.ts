
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
