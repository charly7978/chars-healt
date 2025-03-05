
/**
 * Filter spurious peaks that are too close or too small
 */
export const filterSpuriousPeaks = (signal: number[], potentialPeakIndices: number[]) => {
  if (potentialPeakIndices.length <= 1) return potentialPeakIndices;
  
  // Minimum distance between peaks (in samples)
  const minPeakDistance = 15; // Approximately 0.5 seconds at 30fps
  
  // Minimum amplitude threshold
  const amplitudes = potentialPeakIndices.map(i => signal[i]);
  const meanAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
  const minAmplitude = meanAmplitude * 0.5; // 50% of mean amplitude
  
  const filteredPeaks: number[] = [];
  let lastAddedPeak = -minPeakDistance * 2;
  
  for (let i = 0; i < potentialPeakIndices.length; i++) {
    const currentPeak = potentialPeakIndices[i];
    const currentAmplitude = signal[currentPeak];
    
    // Check if peak is far enough from last added peak and has sufficient amplitude
    if (currentPeak - lastAddedPeak >= minPeakDistance && currentAmplitude >= minAmplitude) {
      filteredPeaks.push(currentPeak);
      lastAddedPeak = currentPeak;
    }
  }
  
  return filteredPeaks;
};

/**
 * Calculate RR intervals and heart rate from peak indices
 */
export const calculateRRIntervals = (peakIndices: number[], signalLength: number, fps: number = 30) => {
  if (peakIndices.length < 2) {
    return {
      intervals: [],
      averageInterval: 0,
      heartRate: 0
    };
  }
  
  // Calculate intervals between peaks (in samples)
  const intervals: number[] = [];
  for (let i = 1; i < peakIndices.length; i++) {
    intervals.push(peakIndices[i] - peakIndices[i - 1]);
  }
  
  // Calculate average interval
  const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  // Convert to heart rate in BPM
  // HR = 60 * sampling_rate / average_interval_in_samples
  const heartRate = Math.round(60 * fps / averageInterval);
  
  return {
    intervals,
    averageInterval,
    heartRate: heartRate >= 40 && heartRate <= 200 ? heartRate : 0
  };
};

/**
 * Calculate the signal quality based on various metrics
 */
export const calculateSignalQuality = (signal: number[], peakIndices: number[]) => {
  if (signal.length < 30 || peakIndices.length < 2) return 0;
  
  // Calculate metrics
  const snr = calculateSNR(signal, peakIndices);
  const peakConsistency = calculatePeakConsistency(peakIndices);
  
  // Combine metrics (with weights)
  const quality = (snr * 0.6) + (peakConsistency * 0.4);
  
  // Map to 0-100 scale
  return Math.max(0, Math.min(100, Math.round(quality * 100)));
};

/**
 * Calculate signal-to-noise ratio
 */
const calculateSNR = (signal: number[], peakIndices: number[]) => {
  // Simple SNR estimation
  const peakValues = peakIndices.map(i => signal[i]);
  const peakMean = peakValues.reduce((a, b) => a + b, 0) / peakValues.length;
  
  const nonPeakIndices = Array.from({length: signal.length}, (_, i) => i)
    .filter(i => !peakIndices.includes(i));
  
  const nonPeakValues = nonPeakIndices.map(i => signal[i]);
  const nonPeakMean = nonPeakValues.reduce((a, b) => a + b, 0) / nonPeakValues.length;
  
  const signalPower = peakMean * peakMean;
  const noisePower = nonPeakMean * nonPeakMean;
  
  return signalPower / (noisePower + 0.0001); // Avoid division by zero
};

/**
 * Calculate consistency of peak intervals
 */
const calculatePeakConsistency = (peakIndices: number[]) => {
  if (peakIndices.length < 3) return 0;
  
  const intervals = [];
  for (let i = 1; i < peakIndices.length; i++) {
    intervals.push(peakIndices[i] - peakIndices[i - 1]);
  }
  
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1; // Coefficient of variation
  
  // Convert CV to a 0-1 quality score (inverse relationship)
  return Math.max(0, Math.min(1, 1 - cv));
};
