
/**
 * Utilidades avanzadas para procesamiento de señales biomédicas
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */

/**
 * Adaptive Noise Cancellation using LMS algorithm
 * Removes environmental and motion noise from PPG signals
 */
export const applyAdaptiveNoiseCancel = (
  primarySignal: number[], 
  referenceSignal: number[], 
  learningRate: number = 0.01,
  filterOrder: number = 8
): number[] => {
  if (primarySignal.length < filterOrder || referenceSignal.length < filterOrder) {
    return [...primarySignal];
  }
  
  const output: number[] = new Array(primarySignal.length).fill(0);
  const weights: number[] = new Array(filterOrder).fill(0);
  
  for (let n = filterOrder; n < primarySignal.length; n++) {
    // Create reference signal buffer
    const refBuffer = [];
    for (let i = 0; i < filterOrder; i++) {
      refBuffer.push(referenceSignal[n - i]);
    }
    
    // Calculate filter output
    let filterOutput = 0;
    for (let i = 0; i < filterOrder; i++) {
      filterOutput += weights[i] * refBuffer[i];
    }
    
    // Calculate error
    const error = primarySignal[n] - filterOutput;
    
    // Update weights
    for (let i = 0; i < filterOrder; i++) {
      weights[i] += learningRate * error * refBuffer[i];
    }
    
    // Store output
    output[n] = error; // The error is our desired signal
  }
  
  // Fill initial outputs (which couldn't be processed due to filter order)
  for (let i = 0; i < filterOrder; i++) {
    output[i] = primarySignal[i];
  }
  
  return output;
};

/**
 * Adaptive Harmonics Removal
 * Removes harmonic interference from PPG signals (e.g., power line 50/60Hz)
 */
export const removeHarmonicInterference = (signal: number[], sampleRate: number, interferenceFreq: number = 50): number[] => {
  if (signal.length < 20) return [...signal];
  
  const output: number[] = [...signal];
  const period = Math.round(sampleRate / interferenceFreq);
  
  if (period < 2) return signal;
  
  // Use moving average over one period of interference frequency
  for (let i = period; i < signal.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += signal[i - j];
    }
    output[i] = sum / period;
  }
  
  return output;
};

/**
 * Multi-scale Wavelet Denoising
 * Uses wavelet transform for advanced denoising while preserving signal morphology
 */
export const applyWaveletDenoising = (signal: number[], threshold: number = 2.0): number[] => {
  if (signal.length < 8) return [...signal];
  
  // Pad signal to next power of 2 if needed
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const paddedSignal = [...signal];
  while (paddedSignal.length < nextPow2) {
    paddedSignal.push(paddedSignal[paddedSignal.length - 1]);
  }
  
  // Apply Discrete Wavelet Transform (simplification - in practice use a real DWT library)
  const coefficients = simpleWaveletTransform(paddedSignal);
  
  // Apply soft thresholding to coefficients
  for (let i = 0; i < coefficients.length; i++) {
    const absCoeff = Math.abs(coefficients[i]);
    if (absCoeff <= threshold) {
      coefficients[i] = 0; // Set small coefficients to zero
    } else {
      // Soft thresholding
      coefficients[i] = Math.sign(coefficients[i]) * (absCoeff - threshold);
    }
  }
  
  // Apply Inverse Wavelet Transform
  const denoised = inverseSimpleWaveletTransform(coefficients);
  
  // Return only the portion corresponding to the original signal length
  return denoised.slice(0, signal.length);
};

/**
 * Simple Wavelet Transform (Haar wavelet for simplicity)
 * In a production environment, use a proper wavelet library
 */
function simpleWaveletTransform(signal: number[]): number[] {
  if (signal.length < 2) return signal;
  
  const n = signal.length;
  const output = new Array(n).fill(0);
  
  // Compute approximation and detail coefficients
  for (let i = 0; i < n/2; i++) {
    const idx = i * 2;
    if (idx + 1 < n) {
      // Approximation coefficient (average)
      output[i] = (signal[idx] + signal[idx + 1]) / Math.sqrt(2);
      // Detail coefficient (difference)
      output[i + n/2] = (signal[idx] - signal[idx + 1]) / Math.sqrt(2);
    }
  }
  
  return output;
}

/**
 * Simple Inverse Wavelet Transform
 */
function inverseSimpleWaveletTransform(coefficients: number[]): number[] {
  if (coefficients.length < 2) return coefficients;
  
  const n = coefficients.length;
  const output = new Array(n).fill(0);
  
  const halfN = n/2;
  
  for (let i = 0; i < halfN; i++) {
    const approximation = coefficients[i];
    const detail = coefficients[i + halfN];
    
    output[i*2] = (approximation + detail) / Math.sqrt(2);
    output[i*2 + 1] = (approximation - detail) / Math.sqrt(2);
  }
  
  return output;
}

/**
 * Calculate Perfusion Index from PPG signal
 * PI = (AC / DC) * 100
 */
export const calculatePerfusionIndex = (signal: number[]): number => {
  if (signal.length < 5) return 0;
  
  const min = Math.min(...signal);
  const max = Math.max(...signal);
  const ac = max - min;
  
  const dc = signal.reduce((sum, val) => sum + val, 0) / signal.length;
  
  if (dc <= 0) return 0;
  
  const pi = (ac / dc) * 100;
  return Math.min(20, Math.max(0, pi)); // Clamp between 0-20%
};

/**
 * Estimate Signal to Noise Ratio
 */
export const estimateSignalToNoiseRatio = (signal: number[]): number => {
  if (signal.length < 10) return 0;
  
  // Estimate signal power
  const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length;
  const signalVariance = signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length;
  
  // Estimate noise using difference between adjacent samples (high-frequency content)
  let noiseVariance = 0;
  for (let i = 1; i < signal.length; i++) {
    noiseVariance += Math.pow(signal[i] - signal[i-1], 2);
  }
  noiseVariance /= (signal.length - 1);
  
  // Adjust noise estimate to account for signal changes
  noiseVariance /= 2;
  
  if (noiseVariance <= 0) return 100;
  
  // Calculate SNR in dB
  const snrDb = 10 * Math.log10(signalVariance / noiseVariance);
  
  // Convert to 0-100 scale
  return Math.min(100, Math.max(0, (snrDb + 10) * 5));
};

/**
 * Phase-aligned averaging for periodic signal enhancement
 */
export const enhancePeriodicSignal = (signal: number[], period: number): number[] => {
  if (signal.length < period * 2 || period < 2) return [...signal];
  
  const output = [...signal];
  const windowSize = 3; // Number of cycles to average
  
  for (let i = period * windowSize; i < signal.length; i++) {
    let sum = signal[i];
    let count = 1;
    
    // Average with corresponding samples from previous cycles
    for (let j = 1; j <= windowSize; j++) {
      const idx = i - period * j;
      if (idx >= 0) {
        sum += signal[idx];
        count++;
      }
    }
    
    output[i] = sum / count;
  }
  
  return output;
};

/**
 * Zero-phase digital filtering to avoid phase distortion
 * Important for preserving timing in cardiac signals
 */
export const applyZeroPhaseFilter = (signal: number[], filterCoeffs: number[]): number[] => {
  if (signal.length < filterCoeffs.length * 2) return [...signal];
  
  // Forward filtering
  const forwardFiltered = applyFilter(signal, filterCoeffs);
  
  // Reverse the result
  const reversed = [...forwardFiltered].reverse();
  
  // Filter again
  const doubleFiltered = applyFilter(reversed, filterCoeffs);
  
  // Reverse back to get zero-phase filtered signal
  return doubleFiltered.reverse();
};

/**
 * Apply FIR filter
 */
function applyFilter(signal: number[], coeffs: number[]): number[] {
  const output = new Array(signal.length).fill(0);
  const order = coeffs.length;
  
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    for (let j = 0; j < order; j++) {
      if (i - j >= 0) {
        sum += coeffs[j] * signal[i - j];
      }
    }
    output[i] = sum;
  }
  
  return output;
}

/**
 * Detect motion artifacts in PPG signal
 * Returns a value between 0-100 indicating motion artifact severity
 */
export const detectMotionArtifacts = (signal: number[]): number => {
  if (signal.length < 10) return 0;
  
  // Calculate first derivative
  const derivatives = [];
  for (let i = 1; i < signal.length; i++) {
    derivatives.push(Math.abs(signal[i] - signal[i-1]));
  }
  
  // Sort derivatives
  const sortedDerivatives = [...derivatives].sort((a, b) => a - b);
  
  // Get 90th percentile as a measure of sudden changes
  const percentile90Idx = Math.floor(sortedDerivatives.length * 0.9);
  const percentile90 = sortedDerivatives[percentile90Idx];
  
  // Count derivatives above threshold
  const threshold = percentile90 * 0.3;
  const artifactCount = derivatives.filter(d => d > threshold).length;
  
  // Calculate artifact percentage
  const artifactPercentage = (artifactCount / derivatives.length) * 100;
  
  // Scale to 0-100
  return Math.min(100, artifactPercentage * 5);
};
