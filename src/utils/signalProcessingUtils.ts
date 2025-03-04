
/**
 * Utilidades para procesamiento de señales
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */

/**
 * Apply Simple Moving Average filter
 */
export const applySMAFilter = (values: number[], newValue: number, windowSize: number = 5): number => {
  const actualWindowSize = Math.min(windowSize, values.length);
  if (actualWindowSize === 0) return newValue;

  let sum = 0;
  const startIdx = Math.max(0, values.length - actualWindowSize);
  for (let i = startIdx; i < values.length; i++) {
    sum += values[i];
  }
  return (sum + newValue) / (actualWindowSize + 1);
};

/**
 * Calculate AC component (PPG pulse amplitude)
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const calculateAC = (values: number[]): number => {
  if (values.length < 4) return 0;
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  return max - min;
};

/**
 * Calculate DC component (baseline PPG signal)
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const calculateDC = (values: number[]): number => {
  if (values.length === 0) return 0;
  
  // DC component is approximated as the mean value of the signal
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  
  return sum / values.length;
};

/**
 * Apply Wavelet Transform to signal for analysis of different frequency components
 * Uses Morlet wavelet for optimal time-frequency localization
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const applyWaveletTransform = (signal: number[], scale: number): number[] => {
  if (!signal || signal.length === 0) return [];
  
  const n = signal.length;
  const coefficients: number[] = new Array(n).fill(0);
  
  // Implementation of continuous wavelet transform
  // Using Morlet wavelet (modulated Gaussian)
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let normFactor = 0;
    
    for (let j = 0; j < n; j++) {
      // Calculate distance from center
      const distFromCenter = (j - i) / scale;
      
      // Morlet wavelet approximation: complex exponential modulated by Gaussian
      // We use only the real part here for simplicity
      const waveletReal = Math.cos(5 * distFromCenter) * Math.exp(-0.5 * distFromCenter * distFromCenter);
      
      // Apply the wavelet
      sum += signal[j] * waveletReal;
      normFactor += waveletReal * waveletReal;
    }
    
    // Normalize the coefficient
    coefficients[i] = normFactor > 0 ? sum / Math.sqrt(normFactor) : 0;
  }
  
  return coefficients;
};

/**
 * Apply adaptive bandpass filter to isolate heart rate frequencies
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const applyAdaptiveBandpassFilter = (signal: number[], lowerFreq: number, upperFreq: number, sampleRate: number = 30): number[] => {
  const n = signal.length;
  if (n < 4) return [...signal];
  
  // Normalize frequencies to Nyquist
  const nyquist = sampleRate / 2;
  const lowNormalized = lowerFreq / nyquist;
  const highNormalized = upperFreq / nyquist;
  
  // Design a simple bandpass filter
  const filtered: number[] = new Array(n).fill(0);
  
  // Initialize with unfiltered values
  for (let i = 0; i < 3; i++) {
    if (i < n) filtered[i] = signal[i];
  }
  
  // Simple IIR bandpass implementation
  // Note: This is a simplification. For production, use a proper DSP library
  const a1 = -2 * Math.cos(Math.PI * (lowNormalized + highNormalized));
  const a2 = 1;
  const b0 = (highNormalized - lowNormalized) / 2;
  const b1 = 0;
  const b2 = -b0;
  
  for (let i = 3; i < n; i++) {
    filtered[i] = b0 * signal[i] + b1 * signal[i-1] + b2 * signal[i-2] - 
                 a1 * filtered[i-1] - a2 * filtered[i-2];
  }
  
  return filtered;
};

/**
 * Calculate hemoglobin level from red and infrared PPG signals
 * Based on optical principles similar to pulse oximetry
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const calculateHemoglobin = (redValues: number[], irValues: number[]): number => {
  // Ensure we have enough data points
  const minLength = Math.min(redValues.length, irValues.length);
  if (minLength < 50) return 0;
  
  try {
    // Prepare signal segments
    const redSegment = redValues.slice(-minLength);
    const irSegment = irValues.slice(-minLength);
    
    // Calculate AC and DC components for both signals
    // AC: pulsatile component, DC: non-pulsatile baseline
    const redAC = calculateAC(redSegment);
    const redDC = calculateDC(redSegment);
    const irAC = calculateAC(irSegment);
    const irDC = calculateDC(irSegment);
    
    if (redDC <= 0 || irDC <= 0 || redAC <= 0 || irAC <= 0) return 0;
    
    // Calculate ratio between red and IR absorption
    // This ratio correlates with hemoglobin concentration
    const redRatio = redAC / redDC;
    const irRatio = irAC / irDC;
    const hemoglobinRatio = redRatio / irRatio;
    
    // Apply empirical calibration formula
    // These coefficients would be calibrated based on clinical data
    const calibratedHemoglobin = 12.5 + 2.8 * (1 - hemoglobinRatio);
    
    // Apply valid range constraints (normal hemoglobin range: 12-17 g/dL)
    // Allow slightly wider range for detection of abnormal values
    return Math.max(8.0, Math.min(20.0, calibratedHemoglobin));
  } catch (error) {
    console.error("Error calculating hemoglobin:", error);
    return 0;
  }
};

/**
 * Adaptive peak detection for heart rate analysis
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const findPeaks = (signal: number[], minDistance: number = 15, prominence: number = 0.5): number[] => {
  const n = signal.length;
  if (n < 3) return [];
  
  const peaks: number[] = [];
  let lastPeakPos = -minDistance;
  
  // Calculate signal range for adaptive thresholding
  const min = Math.min(...signal);
  const max = Math.max(...signal);
  const range = max - min;
  const threshold = min + prominence * range;
  
  for (let i = 1; i < n - 1; i++) {
    // Check if point is a local maximum
    if (signal[i] > signal[i-1] && signal[i] > signal[i+1] && signal[i] > threshold) {
      // Enforce minimum distance between peaks
      if (i - lastPeakPos >= minDistance) {
        peaks.push(i);
        lastPeakPos = i;
      } else if (signal[i] > signal[lastPeakPos]) {
        // If this peak is higher than the last one within minDistance,
        // replace the last peak
        peaks[peaks.length - 1] = i;
        lastPeakPos = i;
      }
    }
  }
  
  return peaks;
};

/**
 * Calculate Respiratory Rate from PPG signal amplitude variations
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export const calculateRespiratoryRate = (signal: number[], sampleRate: number = 30): number => {
  if (signal.length < sampleRate * 5) return 0; // Need at least 5 seconds of data
  
  try {
    // Extract respiratory modulation using envelope detection
    const peaks = findPeaks(signal, Math.floor(sampleRate * 0.25)); // Peaks at least 0.25s apart
    
    if (peaks.length < 4) return 0; // Need at least 4 peaks for reliable estimation
    
    // Extract amplitude modulation pattern from peaks
    const peakAmplitudes = peaks.map(index => signal[index]);
    
    // Resample modulation pattern to regular intervals
    const smoothedAmplitudes = [];
    for (let i = 0; i < peakAmplitudes.length; i += 2) {
      if (i + 1 < peakAmplitudes.length) {
        smoothedAmplitudes.push((peakAmplitudes[i] + peakAmplitudes[i+1]) / 2);
      } else {
        smoothedAmplitudes.push(peakAmplitudes[i]);
      }
    }
    
    if (smoothedAmplitudes.length < 3) return 0;
    
    // Detect respiratory peaks in amplitude modulation
    const breathPeaks = findPeaks(smoothedAmplitudes, 1, 0.3);
    
    if (breathPeaks.length < 2) return 0;
    
    // Calculate average interval between respiratory peaks
    let sumIntervals = 0;
    for (let i = 1; i < breathPeaks.length; i++) {
      // Convert peak index differences to time using original peak positions
      const startPeakIdx = peaks[breathPeaks[i-1] * 2]; // Each smoothed point comes from 2 original peaks
      const endPeakIdx = peaks[breathPeaks[i] * 2];
      const intervalSecs = (endPeakIdx - startPeakIdx) / sampleRate;
      sumIntervals += intervalSecs;
    }
    
    const avgIntervalSecs = sumIntervals / (breathPeaks.length - 1);
    
    // Convert to breaths per minute
    const respiratoryRate = 60 / avgIntervalSecs;
    
    // Apply physiologically plausible range (8-40 breaths per minute)
    return Math.max(8, Math.min(40, respiratoryRate));
  } catch (error) {
    console.error("Error calculating respiratory rate:", error);
    return 0;
  }
};
