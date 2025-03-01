
/**
 * Utility functions for signal processing
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
  
  // 1. Normalizar señal para análisis - asegurando que los picos sean siempre positivos
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  // Calcular valores normalizados y asegurar que sean positivos para detección correcta
  const normalizedValues = range > 0 ? 
                        values.map(v => Math.abs((v - min) / range)) : 
                        values.map(() => 0.5);
  
  // 2. Calcular primera derivada (cambio de pendiente)
  const derivatives: number[] = [];
  for (let i = 1; i < normalizedValues.length; i++) {
    derivatives.push(normalizedValues[i] - normalizedValues[i-1]);
  }
  derivatives.push(0); // Añadir 0 al final para mantener la misma longitud
  
  // 3. Detectar picos con criterios avanzados - corrigiendo la orientación de picos
  for (let i = 2; i < normalizedValues.length - 2; i++) {
    const v = normalizedValues[i];
    
    // Criterio de pico mejorado: más alto que puntos adyacentes y pendiente cambia de positiva a negativa
    // Los picos en PPG son HACIA ARRIBA (valores mayores = más sangre = pico)
    if (v > normalizedValues[i - 1] && 
        v > normalizedValues[i - 2] && 
        v > normalizedValues[i + 1] && 
        v > normalizedValues[i + 2] &&
        derivatives[i-1] > 0 && derivatives[i] < 0) {
      
      peakIndices.push(i);
      
      // Calcular "fuerza" del pico para evaluación de calidad
      const peakStrength = (v - normalizedValues[i-2]) + (v - normalizedValues[i+2]);
      signalStrengths.push(peakStrength);
    }
    
    // Criterio de valle: más bajo que puntos adyacentes y pendiente cambia de negativa a positiva
    if (v < normalizedValues[i - 1] && 
        v < normalizedValues[i - 2] && 
        v < normalizedValues[i + 1] && 
        v < normalizedValues[i + 2] &&
        derivatives[i-1] < 0 && derivatives[i] > 0) {
      
      valleyIndices.push(i);
    }
  }
  
  // 4. Análisis de calidad de señal
  let signalQuality = 0;
  
  if (peakIndices.length >= 3) {
    // Calcular regularidad de intervalos entre picos
    const peakIntervals: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      peakIntervals.push(peakIndices[i] - peakIndices[i-1]);
    }
    
    const intervalMean = peakIntervals.reduce((sum, val) => sum + val, 0) / peakIntervals.length;
    const intervalVariation = peakIntervals.map(interval => 
                               Math.abs(interval - intervalMean) / intervalMean);
    
    const meanIntervalVariation = intervalVariation.reduce((sum, val) => sum + val, 0) / 
                               intervalVariation.length;
    
    // Calcular consistencia de amplitudes de picos
    const peakValues = peakIndices.map(idx => normalizedValues[idx]);
    const peakValueMean = peakValues.reduce((sum, val) => sum + val, 0) / peakValues.length;
    const peakValueVariation = peakValues.map(val => 
                             Math.abs(val - peakValueMean) / peakValueMean);
    
    const meanPeakVariation = peakValueVariation.reduce((sum, val) => sum + val, 0) / 
                           peakValueVariation.length;
    
    // Combinar factores para puntuación final de calidad
    // 1.0 = perfecta, 0.0 = inutilizable
    const intervalConsistency = 1 - Math.min(1, meanIntervalVariation * 2);
    const amplitudeConsistency = 1 - Math.min(1, meanPeakVariation * 2);
    const peakCount = Math.min(1, peakIndices.length / 8); // 8+ picos = puntuación máxima
    
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
    // Asegurar que calculamos amplitudes positivas (pico - valle)
    const amp = Math.abs(values[peaks[i]] - values[valleys[i]]);
    if (amp > 0) {
      amps.push(amp);
    }
  }
  if (amps.length === 0) return 0;

  const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
  return mean;
};
