
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
 * Realiza un análisis de características de la onda cardíaca según estándares médicos
 * Basado en: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5374030/
 */
export const analyzeCardiacWaveform = (values: number[]): {
  pWave: { present: boolean, amplitude: number, duration: number },
  qrs: { amplitude: number, duration: number, morphology: string },
  tWave: { present: boolean, amplitude: number, duration: number },
  segments: { pr: number, st: number, qt: number },
  waveQuality: number
} => {
  if (values.length < 30) {
    // Datos insuficientes para análisis
    return {
      pWave: { present: false, amplitude: 0, duration: 0 },
      qrs: { amplitude: 0, duration: 0, morphology: 'unknown' },
      tWave: { present: false, amplitude: 0, duration: 0 },
      segments: { pr: 0, st: 0, qt: 0 },
      waveQuality: 0
    };
  }

  // Normalización de la señal
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const normalizedValues = range > 0 ? values.map(v => (v - min) / range) : values.map(() => 0.5);
  
  // Análisis básico de derivadas para encontrar puntos de inflexión
  const derivatives: number[] = [];
  for (let i = 1; i < normalizedValues.length; i++) {
    derivatives.push(normalizedValues[i] - normalizedValues[i-1]);
  }
  
  // Detectar componentes de la onda cardíaca
  const { peakIndices, valleyIndices } = findPeaksAndValleys(normalizedValues);
  
  if (peakIndices.length === 0 || valleyIndices.length === 0) {
    return {
      pWave: { present: false, amplitude: 0, duration: 0 },
      qrs: { amplitude: 0, duration: 0, morphology: 'unknown' },
      tWave: { present: false, amplitude: 0, duration: 0 },
      segments: { pr: 0, st: 0, qt: 0 },
      waveQuality: 0
    };
  }
  
  // Adaptar nuestra señal PPG a conceptos ECG
  // En PPG, el pico principal corresponde aproximadamente al complejo QRS
  const mainPeakIndices = peakIndices.filter(idx => {
    const peakValue = normalizedValues[idx];
    return peakValue > 0.5; // Solo picos con amplitud significativa
  });
  
  if (mainPeakIndices.length === 0) {
    return {
      pWave: { present: false, amplitude: 0, duration: 0 },
      qrs: { amplitude: 0, duration: 0, morphology: 'unknown' },
      tWave: { present: false, amplitude: 0, duration: 0 },
      segments: { pr: 0, st: 0, qt: 0 },
      waveQuality: 0
    };
  }
  
  // Usar el pico más alto como referencia para QRS
  const mainPeakIndex = mainPeakIndices.reduce((maxIdx, idx) => 
    normalizedValues[idx] > normalizedValues[maxIdx] ? idx : maxIdx, mainPeakIndices[0]);
  
  // Duración aproximada del QRS (PPG tiene formas diferentes a ECG)
  let qrsStartIndex = mainPeakIndex;
  let qrsEndIndex = mainPeakIndex;
  
  // Buscar hacia atrás para encontrar inicio del QRS
  for (let i = mainPeakIndex - 1; i >= 0; i--) {
    if (derivatives[i] < 0.01 || normalizedValues[i] < 0.2) {
      qrsStartIndex = i;
      break;
    }
  }
  
  // Buscar hacia adelante para encontrar fin del QRS
  for (let i = mainPeakIndex + 1; i < normalizedValues.length; i++) {
    if (derivatives[i-1] > -0.01 || normalizedValues[i] < 0.2) {
      qrsEndIndex = i;
      break;
    }
  }
  
  const qrsDuration = qrsEndIndex - qrsStartIndex;
  const qrsAmplitude = normalizedValues[mainPeakIndex];
  
  // Determinar morfología del QRS basado en la forma
  let qrsMorphology = 'normal';
  const qrsSymmetry = Math.abs((mainPeakIndex - qrsStartIndex) - (qrsEndIndex - mainPeakIndex)) / qrsDuration;
  if (qrsSymmetry > 0.3) {
    qrsMorphology = qrsStartIndex - mainPeakIndex > qrsEndIndex - mainPeakIndex ? 'right-dominant' : 'left-dominant';
  }
  
  // Buscar onda T (en PPG, suele ser una ondulación después del pico principal)
  let tWavePresent = false;
  let tWaveIndex = -1;
  let tWaveAmplitude = 0;
  let tWaveDuration = 0;
  
  // Buscar un pico menor después del QRS
  for (let i = 0; i < peakIndices.length; i++) {
    const idx = peakIndices[i];
    if (idx > qrsEndIndex && idx < qrsEndIndex + normalizedValues.length / 4) {
      tWavePresent = true;
      tWaveIndex = idx;
      tWaveAmplitude = normalizedValues[idx];
      
      // Estimar duración de la onda T
      let tStartIndex = idx;
      let tEndIndex = idx;
      
      // Buscar inicio de onda T
      for (let j = idx - 1; j >= qrsEndIndex; j--) {
        if (normalizedValues[j] < 0.1 || derivatives[j] < 0.001) {
          tStartIndex = j;
          break;
        }
      }
      
      // Buscar fin de onda T
      for (let j = idx + 1; j < normalizedValues.length; j++) {
        if (normalizedValues[j] < 0.1 || derivatives[j-1] > -0.001) {
          tEndIndex = j;
          break;
        }
      }
      
      tWaveDuration = tEndIndex - tStartIndex;
      break;
    }
  }
  
  // Buscar onda P (en PPG puede ser difícil de identificar, buscar ondulación antes del QRS)
  let pWavePresent = false;
  let pWaveIndex = -1;
  let pWaveAmplitude = 0;
  let pWaveDuration = 0;
  
  // Buscar un pico menor antes del QRS
  for (let i = 0; i < peakIndices.length; i++) {
    const idx = peakIndices[i];
    if (idx < qrsStartIndex && idx > qrsStartIndex - normalizedValues.length / 4) {
      pWavePresent = true;
      pWaveIndex = idx;
      pWaveAmplitude = normalizedValues[idx];
      
      // Estimar duración de la onda P
      let pStartIndex = idx;
      let pEndIndex = idx;
      
      // Buscar inicio de onda P
      for (let j = idx - 1; j >= 0; j--) {
        if (normalizedValues[j] < 0.1 || derivatives[j] < 0.001) {
          pStartIndex = j;
          break;
        }
      }
      
      // Buscar fin de onda P
      for (let j = idx + 1; j < qrsStartIndex; j++) {
        if (normalizedValues[j] < 0.1 || derivatives[j-1] > -0.001) {
          pEndIndex = j;
          break;
        }
      }
      
      pWaveDuration = pEndIndex - pStartIndex;
      break;
    }
  }
  
  // Calcular segmentos (aproximados para PPG)
  const prSegment = pWavePresent ? qrsStartIndex - (pWaveIndex + pWaveDuration/2) : 0;
  const stSegment = tWavePresent ? (tWaveIndex - tWaveDuration/2) - (qrsEndIndex) : 0;
  const qtSegment = tWavePresent ? (tWaveIndex + tWaveDuration/2) - qrsStartIndex : 0;
  
  // Calcular calidad de la forma de onda
  let waveQuality = 0;
  
  // Factores de calidad
  const hasQRS = qrsAmplitude > 0.3; // QRS debe ser significativo
  const hasGoodTWave = tWavePresent && tWaveAmplitude > 0.1;
  const hasGoodPWave = pWavePresent && pWaveAmplitude > 0.05;
  const hasGoodQRSDuration = qrsDuration > 5 && qrsDuration < normalizedValues.length / 4;
  
  // Calcular puntuación final
  waveQuality = hasQRS ? 0.6 : 0;
  waveQuality += hasGoodTWave ? 0.2 : 0;
  waveQuality += hasGoodPWave ? 0.1 : 0;
  waveQuality += hasGoodQRSDuration ? 0.1 : 0;
  
  return {
    pWave: { 
      present: pWavePresent, 
      amplitude: pWaveAmplitude, 
      duration: pWaveDuration 
    },
    qrs: { 
      amplitude: qrsAmplitude, 
      duration: qrsDuration, 
      morphology: qrsMorphology 
    },
    tWave: { 
      present: tWavePresent, 
      amplitude: tWaveAmplitude, 
      duration: tWaveDuration 
    },
    segments: { 
      pr: prSegment, 
      st: stSegment, 
      qt: qtSegment 
    },
    waveQuality
  };
};

/**
 * Aplica una transformación de señal PPG a forma similar a ECG para visualización
 * Basado en técnicas de transformación de señales biomédicas
 */
export const transformPPGtoECGLike = (ppgValues: number[]): number[] => {
  if (ppgValues.length < 10) return [...ppgValues];
  
  // 1. Normalizar
  const min = Math.min(...ppgValues);
  const max = Math.max(...ppgValues);
  const range = max - min;
  
  if (range === 0) return ppgValues.map(() => 0);
  
  const normalizedValues = ppgValues.map(v => (v - min) / range);
  
  // 2. Calcular primera y segunda derivada
  const firstDerivative: number[] = [];
  for (let i = 1; i < normalizedValues.length; i++) {
    firstDerivative.push(normalizedValues[i] - normalizedValues[i-1]);
  }
  firstDerivative.push(0);
  
  const secondDerivative: number[] = [];
  for (let i = 1; i < firstDerivative.length; i++) {
    secondDerivative.push(firstDerivative[i] - firstDerivative[i-1]);
  }
  secondDerivative.push(0);
  
  // 3. Combinar señal original con derivadas para resemblar un ECG
  const transformedSignal: number[] = [];
  
  for (let i = 0; i < normalizedValues.length; i++) {
    // Combinación ponderada para simular forma ECG
    // - La señal normalizada mantiene la forma general
    // - Primera derivada acentúa cambios rápidos (como complejo QRS)
    // - Segunda derivada acentúa puntos de inflexión
    const value = normalizedValues[i] * 0.4 - 
                  firstDerivative[i] * 6.0 + 
                  secondDerivative[i] * (-1.5);
    
    transformedSignal.push(value);
  }
  
  // 4. Normalización final para ajustar rango
  const tMin = Math.min(...transformedSignal);
  const tMax = Math.max(...transformedSignal);
  const tRange = tMax - tMin;
  
  const finalSignal = transformedSignal.map(v => (v - tMin) / tRange - 0.2);
  
  return finalSignal;
};
