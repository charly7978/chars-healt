
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
 * Calculate hemoglobin concentration using optical properties
 * Based on modified Beer-Lambert law for non-invasive estimation
 * @param redSignal - Array of values from red wavelength sensor (typically 660nm)
 * @param irSignal - Array of values from infrared wavelength sensor (typically 940nm)
 * @returns Hemoglobin estimation in g/dL
 */
export const calculateHemoglobin = (
  redSignal: number[],
  irSignal: number[]
): number => {
  // Ensure we have valid data
  if (!redSignal || !irSignal || redSignal.length < 10 || irSignal.length < 10) {
    console.log("Insufficient data for hemoglobin calculation");
    return 0;
  }

  try {
    // Calculate AC and DC components for both wavelengths
    const redAC = calculateAC(redSignal);
    const redDC = calculateDC(redSignal);
    const irAC = calculateAC(irSignal);
    const irDC = calculateDC(irSignal);

    // Log raw values for debugging
    console.log(`Hemoglobin calculation - redAC: ${redAC}, redDC: ${redDC}, irAC: ${irAC}, irDC: ${irDC}`);

    // Avoid division by zero or very small values
    if (redDC < 0.001 || irDC < 0.001 || irAC < 0.001) {
      console.log("Invalid signal values for hemoglobin calculation");
      return 0;
    }

    // Calculate R value (ratio of ratios) used in pulse oximetry
    // R = (AC_red/DC_red)/(AC_ir/DC_ir)
    const R = (redAC / redDC) / (irAC / irDC);
    
    if (isNaN(R) || R <= 0) {
      console.log("Invalid R ratio calculated:", R);
      return 0;
    }
    
    console.log(`Hemoglobin R ratio: ${R}`);

    // Apply Beer-Lambert based model for hemoglobin estimation
    // Coefficients based on empirical data and optical properties of hemoglobin
    const a = 14.5; // Baseline for normal hemoglobin
    const b = -9.8; // Coefficient for R ratio
    const c = 2.7;  // Coefficient for squared term (non-linearity)

    // Calculate hemoglobin using polynomial model
    let hemoglobin = a + (b * R) + (c * Math.pow(R, 2));
    
    if (isNaN(hemoglobin)) {
      console.log("Hemoglobin calculation resulted in NaN");
      return 0;
    }

    // Apply physiological limits (normal range for adults is ~12-17 g/dL)
    hemoglobin = Math.max(5.0, Math.min(22.0, hemoglobin));

    // Round to one decimal place for display
    const roundedValue = Math.round(hemoglobin * 10) / 10;
    console.log(`Final hemoglobin value: ${roundedValue} g/dL`);
    return roundedValue;
  } catch (error) {
    console.error("Error calculating hemoglobin:", error);
    return 0;
  }
};
