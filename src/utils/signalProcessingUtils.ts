/**
 * Utilidades avanzadas para procesamiento de señales PPG
 * Incluye implementaciones de filtros y algoritmos de detección
 */

/**
 * Applies a Simple Moving Average (SMA) filter to the signal
 * @param buffer - Buffer de valores previos
 * @param newValue - Nuevo valor a filtrar
 * @param windowSize - Tamaño de la ventana de filtrado
 */
export function applySMAFilter(buffer: number[], newValue: number, windowSize: number): number {
  // Si no hay suficientes valores en el buffer, retornar el valor actual
  if (buffer.length < windowSize - 1) {
    return newValue;
  }
  
  // Calcular el promedio incluyendo el nuevo valor
  const values = [...buffer.slice(-(windowSize - 1)), newValue];
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calcula la desviación estándar de un conjunto de valores
 * @param values - Array de valores
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  
  return Math.sqrt(variance);
}

/**
 * Implementación del filtro Butterworth paso bajo
 * Diseñado para señales PPG (frecuencia de corte ~5Hz para muestreo a 30Hz)
 * @param values - Array de valores a filtrar
 */
export function applyButterworthFilter(values: number[]): number[] {
  if (values.length < 3) return [...values];
  
  const a = [1.0, -1.5784, 0.6126];
  const b = [0.0086, 0.0172, 0.0086];
  const order = 2;
  
  // Preparar arrays para entrada y salida
  const inputs = [...values];
  const outputs = new Array(values.length).fill(0);
  
  // Aplicar el filtro
  for (let n = 0; n < values.length; n++) {
    outputs[n] = b[0] * inputs[n];
    
    for (let i = 1; i <= order; i++) {
      if (n - i >= 0) {
        outputs[n] += b[i] * inputs[n - i];
      }
      
      if (n - i >= 0) {
        outputs[n] -= a[i] * outputs[n - i];
      }
    }
  }
  
  return outputs;
}

/**
 * NUEVO: Filtro adaptativo para señales PPG
 * Se ajusta automáticamente según la calidad de la señal
 * @param values - Array de valores a filtrar
 * @param quality - Calidad de la señal (0-100)
 */
export function applyAdaptiveFilter(values: number[], quality: number): number[] {
  if (values.length < 5) return [...values];
  
  // Ajustar parámetros según la calidad de la señal
  // Más agresivo con baja calidad, más sutil con alta calidad
  const adaptiveFactor = 1.0 - (quality / 100) * 0.8;
  
  const filtered = [];
  const windowSize = Math.min(5, values.length);
  
  for (let i = 0; i < values.length; i++) {
    if (i < windowSize - 1) {
      filtered.push(values[i]);
      continue;
    }
    
    // Calcular promedio de la ventana
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += values[i - j];
    }
    const avg = sum / windowSize;
    
    // Aplicar filtrado adaptativo
    filtered.push(values[i] * (1 - adaptiveFactor) + avg * adaptiveFactor);
  }
  
  return filtered;
}

/**
 * MEJORADO: Detección avanzada de picos y valles en señal PPG
 * @param values - Array de valores para análisis
 */
export function enhancedPeakDetection(values: number[]): {
  peakIndices: number[],
  valleyIndices: number[],
  signalQuality: number
} {
  if (values.length < 10) {
    return { peakIndices: [], valleyIndices: [], signalQuality: 0 };
  }
  
  const peakIndices: number[] = [];
  const valleyIndices: number[] = [];
  
  // Primera pasada: detectar todos los picos y valles
  for (let i = 2; i < values.length - 2; i++) {
    // Detectar pico (máximo local)
    if (values[i] > values[i-1] && values[i] > values[i+1] &&
        values[i] > values[i-2] && values[i] > values[i+2]) {
      peakIndices.push(i);
    }
    
    // Detectar valle (mínimo local)
    if (values[i] < values[i-1] && values[i] < values[i+1] &&
        values[i] < values[i-2] && values[i] < values[i+2]) {
      valleyIndices.push(i);
    }
  }
  
  // Segunda pasada: filtrar picos y valles espurios
  const filteredPeaks: number[] = [];
  const filteredValleys: number[] = [];
  
  // Calcular amplitud promedio
  let totalAmp = 0;
  let count = 0;
  
  for (let i = 0; i < peakIndices.length; i++) {
    const peakIdx = peakIndices[i];
    let closestValleyIdx = -1;
    let minDist = Number.MAX_VALUE;
    
    // Encontrar valle más cercano
    for (const valleyIdx of valleyIndices) {
      const dist = Math.abs(peakIdx - valleyIdx);
      if (dist < minDist) {
        minDist = dist;
        closestValleyIdx = valleyIdx;
      }
    }
    
    if (closestValleyIdx >= 0) {
      // Calcular amplitud pico-valle
      const amplitude = values[peakIdx] - values[closestValleyIdx];
      totalAmp += amplitude;
      count++;
    }
  }
  
  // Calcular amplitud promedio
  const avgAmp = count > 0 ? totalAmp / count : 0;
  
  // Si no se detectó amplitud, retornar arrays vacíos
  if (avgAmp <= 0) {
    return { peakIndices: [], valleyIndices: [], signalQuality: 0 };
  }
  
  // Filtrar picos basados en amplitud mínima (30% del promedio)
  const minAmp = avgAmp * 0.3;
  
  for (let i = 0; i < peakIndices.length; i++) {
    const peakIdx = peakIndices[i];
    let validPeak = false;
    
    // Verificar que haya un valle cercano con amplitud suficiente
    for (const valleyIdx of valleyIndices) {
      const dist = Math.abs(peakIdx - valleyIdx);
      if (dist <= 10) { // Valle en ventana de 10 muestras
        const amplitude = values[peakIdx] - values[valleyIdx];
        if (amplitude >= minAmp) {
          validPeak = true;
          break;
        }
      }
    }
    
    if (validPeak) {
      filteredPeaks.push(peakIdx);
    }
  }
  
  // Filtrar valles con criterio similar
  for (const valleyIdx of valleyIndices) {
    let validValley = false;
    
    for (const peakIdx of filteredPeaks) {
      const dist = Math.abs(peakIdx - valleyIdx);
      if (dist <= 10) {
        const amplitude = values[peakIdx] - values[valleyIdx];
        if (amplitude >= minAmp) {
          validValley = true;
          break;
        }
      }
    }
    
    if (validValley) {
      filteredValleys.push(valleyIdx);
    }
  }
  
  // Calcular calidad de la señal
  let signalQuality = 0;
  
  if (filteredPeaks.length >= 2) {
    // Calcular intervalos entre picos consecutivos
    const intervals: number[] = [];
    for (let i = 1; i < filteredPeaks.length; i++) {
      intervals.push(filteredPeaks[i] - filteredPeaks[i-1]);
    }
    
    // Calcular variabilidad de intervalos (menor = mejor)
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variability = intervals.reduce((sum, val) => sum + Math.abs(val - avgInterval), 0) / intervals.length;
    
    // Normalizar variabilidad: 0 = muy variable, 1 = muy estable
    const intervalStability = Math.max(0, Math.min(1, 1 - (variability / avgInterval)));
    
    // Calcular proporción de picos/valles a longitud de señal (indicador de ruido)
    const signalLengthRatio = Math.min(1, (filteredPeaks.length * 4) / values.length);
    
    // Calcular amplitud normalizada (1 = alta amplitud, 0 = baja amplitud)
    const amplitudeQuality = Math.min(1, avgAmp / 50);
    
    // Combinar factores para calidad final
    signalQuality = (intervalStability * 0.6 + signalLengthRatio * 0.2 + amplitudeQuality * 0.2) * 100;
  }
  
  return { 
    peakIndices: filteredPeaks, 
    valleyIndices: filteredValleys,
    signalQuality: Math.round(signalQuality)
  };
}

/**
 * Fusión de sensores ponderada para combinar múltiples mediciones
 * @param values - Array de mediciones
 * @param weights - Array de pesos correspondientes (opcional)
 */
export function weightedSensorFusion(values: number[], weights?: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  
  // Si no se proporcionan pesos, usar uniformes
  const actualWeights = weights || new Array(values.length).fill(1.0 / values.length);
  
  // Asegurar que tenemos la misma cantidad de pesos que valores
  if (actualWeights.length !== values.length) {
    throw new Error('La cantidad de pesos debe coincidir con la cantidad de valores');
  }
  
  // Aplicar fusion ponderada
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < values.length; i++) {
    weightedSum += values[i] * actualWeights[i];
    totalWeight += actualWeights[i];
  }
  
  // Normalizar por suma de pesos
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Detección de outliers y valores atípicos
 * @param values - Array de valores
 * @param stdDevFactor - Factor de desviación estándar para considerar outlier (default: 2.0)
 */
export function removeOutliers(values: number[], stdDevFactor: number = 2.0): number[] {
  if (values.length < 4) return [...values];
  
  // Calcular estadísticas
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const stdDev = calculateStandardDeviation(values);
  
  // Límites para detección de outliers
  const lowerBound = mean - stdDevFactor * stdDev;
  const upperBound = mean + stdDevFactor * stdDev;
  
  // Filtrar valores dentro de límites
  return values.filter(val => val >= lowerBound && val <= upperBound);
}
