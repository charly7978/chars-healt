
/**
 * Utility functions for signal processing
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */

/**
 * Calculate Simple Moving Average
 */
export const applySMAFilter = (values: number[], newValue: number, windowSize: number): number => {
  const smaBuffer = values.slice(-windowSize);
  smaBuffer.push(newValue);
  return smaBuffer.reduce((a, b) => a + b, 0) / smaBuffer.length;
};

/**
 * Calculate AC component (amplitude) of a signal
 */
export const calculateAC = (values: number[]): number => {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
};

/**
 * Calculate DC component (average) of a signal
 */
export const calculateDC = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

/**
 * Calculate standard deviation of values
 */
export const calculateStandardDeviation = (values: number[]): number => {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(avgSqDiff);
};

/**
 * Find peaks and valleys in a signal
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
export const findPeaksAndValleys = (values: number[]) => {
  const peakIndices: number[] = [];
  const valleyIndices: number[] = [];

  for (let i = 2; i < values.length - 2; i++) {
    const v = values[i];
    if (
      v > values[i - 1] &&
      v > values[i - 2] &&
      v > values[i + 1] &&
      v > values[i + 2]
    ) {
      peakIndices.push(i);
    }
    if (
      v < values[i - 1] &&
      v < values[i - 2] &&
      v < values[i + 1] &&
      v < values[i + 2]
    ) {
      valleyIndices.push(i);
    }
  }
  return { peakIndices, valleyIndices };
};

/**
 * Enhanced peak detection with quality assessment
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
  
  // 2. Calculate first derivative (slope change)
  const derivatives: number[] = [];
  for (let i = 1; i < normalizedValues.length; i++) {
    derivatives.push(normalizedValues[i] - normalizedValues[i-1]);
  }
  derivatives.push(0); // Add 0 at the end to maintain same length
  
  // 3. Detect peaks with advanced criteria
  for (let i = 2; i < normalizedValues.length - 2; i++) {
    const v = normalizedValues[i];
    
    // Peak criteria: higher than adjacent points and slope changes from positive to negative
    if (v > normalizedValues[i - 1] && 
        v > normalizedValues[i - 2] && 
        v > normalizedValues[i + 1] && 
        v > normalizedValues[i + 2] &&
        derivatives[i-1] > 0 && derivatives[i] < 0) {
      
      peakIndices.push(i);
      
      // Calculate peak "strength" for quality evaluation
      const peakStrength = (v - normalizedValues[i-2]) + (v - normalizedValues[i+2]);
      signalStrengths.push(peakStrength);
    }
    
    // Valley criteria: lower than adjacent points and slope changes from negative to positive
    if (v < normalizedValues[i - 1] && 
        v < normalizedValues[i - 2] && 
        v < normalizedValues[i + 1] && 
        v < normalizedValues[i + 2] &&
        derivatives[i-1] < 0 && derivatives[i] > 0) {
      
      valleyIndices.push(i);
    }
  }
  
  // 4. Signal quality analysis
  let signalQuality = 0;
  
  if (peakIndices.length >= 3) {
    // Calculate regularity of intervals between peaks
    const peakIntervals: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      peakIntervals.push(peakIndices[i] - peakIndices[i-1]);
    }
    
    const intervalMean = peakIntervals.reduce((sum, val) => sum + val, 0) / peakIntervals.length;
    const intervalVariation = peakIntervals.map(interval => 
                               Math.abs(interval - intervalMean) / intervalMean);
    
    const meanIntervalVariation = intervalVariation.reduce((sum, val) => sum + val, 0) / 
                               intervalVariation.length;
    
    // Calculate consistency of peak amplitudes
    const peakValues = peakIndices.map(idx => normalizedValues[idx]);
    const peakValueMean = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
    const peakValueVariation = peakValues.map(val => 
                             Math.abs(val - peakValueMean) / peakValueMean);
    
    const meanPeakVariation = peakValueVariation.reduce((sum, val) => sum + val, 0) / 
                           peakValueVariation.length;
    
    // Combine factors for final quality score
    // 1.0 = perfect, 0.0 = unusable
    const intervalConsistency = 1 - Math.min(1, meanIntervalVariation * 2);
    const amplitudeConsistency = 1 - Math.min(1, meanPeakVariation * 2);
    const peakCount = Math.min(1, peakIndices.length / 8); // 8+ peaks = maximum score
    
    signalQuality = intervalConsistency * 0.5 + amplitudeConsistency * 0.3 + peakCount * 0.2;
  }
  
  return { peakIndices, valleyIndices, signalQuality };
};

/**
 * Calculate amplitude from peaks and valleys
 */
export const calculateAmplitude = (
  values: number[],
  peaks: number[],
  valleys: number[]
): number => {
  if (peaks.length === 0 || valleys.length === 0) return 0;

  const amps: number[] = [];
  const len = Math.min(peaks.length, valleys.length);
  for (let i = 0; i < len; i++) {
    const amp = values[peaks[i]] - values[valleys[i]];
    if (amp > 0) {
      amps.push(amp);
    }
  }
  if (amps.length === 0) return 0;

  const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
  return mean;
};

/**
 * Calcula el valor estimado de hemoglobina basado en señales PPG
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
export function calculateHemoglobin(redSignal: number[], irSignal: number[]): number {
  if (redSignal.length < 50 || irSignal.length < 50) {
    console.log("Not enough signal data for hemoglobin calculation");
    return 0;
  }
  
  try {
    // Use actual measured signals for calculation
    const sampleSize = Math.min(redSignal.length, irSignal.length);
    const red = redSignal.slice(-sampleSize);
    const ir = irSignal.slice(-sampleSize);
    
    // Calculate the ratio between red and IR signal strengths
    const redAvg = red.reduce((sum, val) => sum + val, 0) / red.length;
    const irAvg = ir.reduce((sum, val) => sum + val, 0) / ir.length;
    
    if (redAvg <= 0 || irAvg <= 0) {
      return 0;
    }
    
    // Calculate pulsatile component (AC) for both signals
    let redAC = 0;
    let irAC = 0;
    
    for (let i = 1; i < sampleSize; i++) {
      redAC += Math.abs(red[i] - red[i-1]);
      irAC += Math.abs(ir[i] - ir[i-1]);
    }
    
    redAC /= (sampleSize - 1);
    irAC /= (sampleSize - 1);
    
    // Calculate DC components
    const redDC = redAvg;
    const irDC = irAvg;
    
    // Calculate R value (similar to SpO2 calculation)
    const R = (redAC / redDC) / (irAC / irDC);
    
    // Direct calculation from measured optical signals
    // Only apply basic calibration to ensure valid range
    const hemoglobinValue = 15.0 - ((R - 0.8) * 8);
    
    // Ensure physiologically possible values
    return Math.max(8.0, Math.min(18.0, hemoglobinValue));
  } catch (error) {
    console.error("Error calculating hemoglobin:", error);
    return 0;
  }
}
