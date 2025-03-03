/**
 * RespiratoryRateProcessor.ts
 * 
 * Procesador para detectar y analizar la tasa respiratoria a partir de la 
 * modulación de la señal PPG provocada por la respiración.
 */

import { enhancedPeakDetection } from '../utils/signalProcessingUtils';

interface RespiratoryData {
  rate: number;            // Respiraciones por minuto
  amplitude: number;       // Amplitud de la modulación respiratoria
  confidence: number;      // Confianza en la medición (0-100)
  pattern: 'normal' | 'shallow' | 'deep' | 'irregular' | 'unknown'; // Patrón respiratorio
  irregularityScore: number; // Puntuación de irregularidad (0-100)
}

export class RespiratoryRateProcessor {
  // Parámetros de configuración
  private readonly WINDOW_SIZE = 600;           // 20 segundos a 30fps
  private readonly RESP_MIN_RATE = 8;           // Min respiraciones por minuto (adulto en reposo)
  private readonly RESP_MAX_RATE = 25;          // Max respiraciones por minuto (normal)
  private readonly RESP_NORMAL_RATE = 16;       // Tasa respiratoria normal adulto
  private readonly MIN_CONFIDENCE_THRESHOLD = 60; // Umbral mínimo de confianza (%)
  private readonly SMOOTHING_FACTOR = 0.15;     // Factor de suavizado para actualización
  private readonly LOW_PASS_CUTOFF = 0.5;       // Frecuencia de corte para filtro paso bajo (Hz)
  private readonly BUFFER_SIZE = 900;           // 30 segundos a 30fps
  
  // Variables de estado
  private ppgSignalBuffer: number[] = [];       // Buffer de señal PPG raw
  private envelopeUpperBuffer: number[] = [];   // Envolvente superior
  private envelopeLowerBuffer: number[] = [];   // Envolvente inferior
  private respirationSignal: number[] = [];     // Señal respiratoria extraída
  private lastRespiratoryRates: number[] = [];  // Últimas tasas respiratorias calculadas
  private lastConfidenceValues: number[] = [];  // Últimas confianzas calculadas
  private lastBreathAmplitudes: number[] = [];  // Últimas amplitudes respiratorias
  private lastIrregularityScores: number[] = []; // Últimas puntuaciones de irregularidad
  
  // Valores actuales
  private currentRespRate: number = 0;
  private currentConfidence: number = 0;
  private currentAmplitude: number = 0;
  private currentPattern: RespiratoryData['pattern'] = 'unknown';
  private currentIrregularityScore: number = 0;
  private processingStartTime: number = 0;
  
  /**
   * Constructor
   */
  constructor() {
    this.reset();
  }
  
  /**
   * Resetear el procesador
   */
  reset(): void {
    this.ppgSignalBuffer = [];
    this.envelopeUpperBuffer = [];
    this.envelopeLowerBuffer = [];
    this.respirationSignal = [];
    this.lastRespiratoryRates = [];
    this.lastConfidenceValues = [];
    this.lastBreathAmplitudes = [];
    this.lastIrregularityScores = [];
    this.currentRespRate = 0;
    this.currentConfidence = 0;
    this.currentAmplitude = 0;
    this.currentPattern = 'unknown';
    this.currentIrregularityScore = 0;
    this.processingStartTime = Date.now();
  }
  
  /**
   * Procesar un nuevo valor de la señal PPG
   * @param ppgValue Valor de la señal PPG procesada
   * @param quality Calidad de la señal (0-100)
   * @returns Datos respiratorios procesados
   */
  processSignal(ppgValue: number, quality: number): RespiratoryData | null {
    // No procesar si la calidad es muy baja
    if (quality < 30) {
      return null;
    }
    
    // Agregar al buffer de señal
    this.ppgSignalBuffer.push(ppgValue);
    
    // Mantener tamaño del buffer
    if (this.ppgSignalBuffer.length > this.BUFFER_SIZE) {
      this.ppgSignalBuffer.shift();
    }
    
    // Necesitamos suficientes datos para el análisis
    if (this.ppgSignalBuffer.length < this.WINDOW_SIZE) {
      return null;
    }
    
    // Actualizar cada 15 frames (0.5 segundos a 30fps) para reducir carga de CPU
    // pero retornar último valor calculado en cada llamada
    if (this.ppgSignalBuffer.length % 15 === 0) {
      this.updateRespiratoryData(quality);
    }
    
    // Si no tenemos datos confiables aún, retornar null
    if (this.currentConfidence < this.MIN_CONFIDENCE_THRESHOLD) {
      return null;
    }
    
    // Retornar datos respiratorios actuales
    return {
      rate: this.currentRespRate,
      amplitude: this.currentAmplitude,
      confidence: this.currentConfidence,
      pattern: this.currentPattern,
      irregularityScore: this.currentIrregularityScore
    };
  }
  
  /**
   * Obtener los datos respiratorios más recientes
   */
  getCurrentRespiratoryData(): RespiratoryData | null {
    if (this.currentConfidence < this.MIN_CONFIDENCE_THRESHOLD) {
      return null;
    }
    
    return {
      rate: this.currentRespRate,
      amplitude: this.currentAmplitude,
      confidence: this.currentConfidence,
      pattern: this.currentPattern,
      irregularityScore: this.currentIrregularityScore
    };
  }
  
  /**
   * Actualizar datos respiratorios procesando la señal actual
   */
  private updateRespiratoryData(signalQuality: number): void {
    try {
      // 1. Extraer envolventes de la señal PPG
      this.extractEnvelopes();
      
      // 2. Derivar señal respiratoria a partir de las envolventes
      this.deriveRespirationSignal();
      
      // 3. Detectar respiraciones en la señal derivada
      const respiratoryData = this.detectRespirations(signalQuality);
      
      // 4. Actualizar valores actuales con suavizado
      if (respiratoryData) {
        this.updateCurrentValues(respiratoryData);
      }
    } catch (error) {
      console.error("Error procesando datos respiratorios:", error);
    }
  }
  
  /**
   * Extraer envolventes superior e inferior de la señal PPG
   */
  private extractEnvelopes(): void {
    const windowSize = this.WINDOW_SIZE;
    const signalToProcess = this.ppgSignalBuffer.slice(-windowSize);
    
    // Aplicar filtro de media móvil para suavizar la señal
    const smoothedSignal = this.applyMovingAverage(signalToProcess, 5);
    
    // Detectar picos y valles
    const { peakIndices, valleyIndices } = enhancedPeakDetection(smoothedSignal);
    
    // Si no hay suficientes picos y valles, no podemos extraer envolventes confiables
    if (peakIndices.length < 3 || valleyIndices.length < 3) {
      return;
    }
    
    // Crear arrays de tiempo y amplitud para picos y valles
    const peakTimes: number[] = [];
    const peakAmplitudes: number[] = [];
    const valleyTimes: number[] = [];
    const valleyAmplitudes: number[] = [];
    
    // Llenar arrays de picos
    for (const idx of peakIndices) {
      peakTimes.push(idx);
      peakAmplitudes.push(smoothedSignal[idx]);
    }
    
    // Llenar arrays de valles
    for (const idx of valleyIndices) {
      valleyTimes.push(idx);
      valleyAmplitudes.push(smoothedSignal[idx]);
    }
    
    // Interpolar envolventes para toda la señal
    const upperEnvelope = this.interpolateEnvelope(peakTimes, peakAmplitudes, windowSize);
    const lowerEnvelope = this.interpolateEnvelope(valleyTimes, valleyAmplitudes, windowSize);
    
    // Guardar envolventes
    this.envelopeUpperBuffer = upperEnvelope;
    this.envelopeLowerBuffer = lowerEnvelope;
  }
  
  /**
   * Interpolar envolvente a partir de puntos de tiempo y amplitud
   */
  private interpolateEnvelope(
    times: number[], 
    amplitudes: number[], 
    length: number
  ): number[] {
    // Si no hay puntos, retornar array vacío
    if (times.length === 0) {
      return new Array(length).fill(0);
    }
    
    const envelope = new Array(length).fill(0);
    
    // Para cada punto en la señal, encontrar los puntos de envolvente más cercanos e interpolar
    for (let i = 0; i < length; i++) {
      // Encontrar índices de los puntos más cercanos
      let leftIdx = -1;
      let rightIdx = -1;
      
      for (let j = 0; j < times.length; j++) {
        if (times[j] <= i) {
          leftIdx = j;
        }
        if (times[j] >= i && rightIdx === -1) {
          rightIdx = j;
        }
      }
      
      // Casos especiales
      if (leftIdx === -1) {
        // Punto está antes del primer punto de envolvente
        envelope[i] = amplitudes[0];
      } else if (rightIdx === -1) {
        // Punto está después del último punto de envolvente
        envelope[i] = amplitudes[amplitudes.length - 1];
      } else if (leftIdx === rightIdx) {
        // Punto coincide exactamente con un punto de envolvente
        envelope[i] = amplitudes[leftIdx];
      } else {
        // Interpolar entre los dos puntos más cercanos
        const leftTime = times[leftIdx];
        const rightTime = times[rightIdx];
        const leftAmp = amplitudes[leftIdx];
        const rightAmp = amplitudes[rightIdx];
        
        // Interpolación lineal
        envelope[i] = leftAmp + (rightAmp - leftAmp) * (i - leftTime) / (rightTime - leftTime);
      }
    }
    
    return envelope;
  }
  
  /**
   * Derivar señal respiratoria a partir de envolventes
   */
  private deriveRespirationSignal(): void {
    if (this.envelopeUpperBuffer.length === 0 || this.envelopeLowerBuffer.length === 0) {
      return;
    }
    
    const length = Math.min(this.envelopeUpperBuffer.length, this.envelopeLowerBuffer.length);
    this.respirationSignal = new Array(length);
    
    // Calcular la diferencia entre envolventes como señal respiratoria
    for (let i = 0; i < length; i++) {
      this.respirationSignal[i] = this.envelopeUpperBuffer[i] - this.envelopeLowerBuffer[i];
    }
    
    // Normalizar señal respiratoria
    const min = Math.min(...this.respirationSignal);
    const max = Math.max(...this.respirationSignal);
    const range = max - min;
    
    if (range > 0) {
      for (let i = 0; i < length; i++) {
        this.respirationSignal[i] = (this.respirationSignal[i] - min) / range;
      }
    }
    
    // Aplicar filtro paso bajo para aislar componente respiratoria
    this.respirationSignal = this.applyLowPassFilter(this.respirationSignal, this.LOW_PASS_CUTOFF, 30);
  }
  
  /**
   * Detectar respiraciones en la señal respiratoria
   */
  private detectRespirations(signalQuality: number): RespiratoryData | null {
    if (this.respirationSignal.length < this.WINDOW_SIZE * 0.75) {
      return null;
    }
    
    // Usar los últimos 15 segundos para detección (450 muestras a 30fps)
    const analysisWindow = Math.min(450, this.respirationSignal.length);
    const respirationSignal = this.respirationSignal.slice(-analysisWindow);
    
    // Detectar picos (inhalaciones)
    const { peakIndices, valleyIndices, signalQuality: respQuality } = enhancedPeakDetection(respirationSignal);
    
    // Necesitamos al menos 2 respiraciones para calcular tasa
    if (peakIndices.length < 2) {
      return null;
    }
    
    // Calcular intervalos entre respiraciones
    const intervals: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const interval = peakIndices[i] - peakIndices[i - 1];
      intervals.push(interval);
    }
    
    // Calcular tasa respiratoria (respiraciones por minuto)
    const avgIntervalFrames = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const avgIntervalSeconds = avgIntervalFrames / 30; // 30fps
    const respiratoryRate = 60 / avgIntervalSeconds; // Respiraciones por minuto
    
    // Verificar si está en rango fisiológico
    if (respiratoryRate < this.RESP_MIN_RATE || respiratoryRate > this.RESP_MAX_RATE) {
      return null;
    }
    
    // Calcular amplitud de respiración
    const breathAmplitudes: number[] = [];
    for (let i = 0; i < Math.min(peakIndices.length, valleyIndices.length); i++) {
      const peakIdx = peakIndices[i];
      // Buscar el valle más cercano antes del pico
      let closestValleyIdx = -1;
      let minDistance = Infinity;
      
      for (const valleyIdx of valleyIndices) {
        if (valleyIdx < peakIdx) {
          const distance = peakIdx - valleyIdx;
          if (distance < minDistance) {
            minDistance = distance;
            closestValleyIdx = valleyIdx;
          }
        }
      }
      
      if (closestValleyIdx !== -1) {
        const amplitude = respirationSignal[peakIdx] - respirationSignal[closestValleyIdx];
        breathAmplitudes.push(amplitude);
      }
    }
    
    const avgAmplitude = breathAmplitudes.length > 0 ? 
      breathAmplitudes.reduce((sum, amp) => sum + amp, 0) / breathAmplitudes.length : 0;
    
    // Calcular irregularidad: variabilidad de intervalos respiratorios
    let irregularityScore = 0;
    if (intervals.length >= 2) {
      const intervalMean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      const intervalVariation = intervals.reduce((sum, interval) => {
        return sum + Math.abs(interval - intervalMean);
      }, 0) / intervals.length;
      
      // Normalizar puntuación de irregularidad (0-100)
      irregularityScore = Math.min(100, (intervalVariation / intervalMean) * 100);
    }
    
    // Determinar patrón respiratorio
    let pattern: RespiratoryData['pattern'] = 'normal';
    
    if (irregularityScore > 40) {
      pattern = 'irregular';
    } else if (avgAmplitude < 0.15) {
      pattern = 'shallow';
    } else if (avgAmplitude > 0.5) {
      pattern = 'deep';
    }
    
    // Calcular confianza basada en calidad de señal, número de respiraciones detectadas y calidad PPG
    const respCount = peakIndices.length;
    const countFactor = Math.min(1, respCount / 8); // Mejor confianza con más respiraciones detectadas
    const qualityFactor = signalQuality / 100;
    const respQualityFactor = respQuality / 100;
    
    const confidenceRaw = countFactor * 0.4 + respQualityFactor * 0.4 + qualityFactor * 0.2;
    const confidence = Math.round(confidenceRaw * 100);
    
    return {
      rate: Math.round(respiratoryRate * 10) / 10, // Redondear a 1 decimal
      amplitude: avgAmplitude,
      confidence: confidence,
      pattern: pattern,
      irregularityScore: Math.round(irregularityScore)
    };
  }
  
  /**
   * Actualizar valores actuales con suavizado para estabilidad
   */
  private updateCurrentValues(newData: RespiratoryData): void {
    // Guardar historial de valores
    this.lastRespiratoryRates.push(newData.rate);
    this.lastConfidenceValues.push(newData.confidence);
    this.lastBreathAmplitudes.push(newData.amplitude);
    this.lastIrregularityScores.push(newData.irregularityScore);
    
    // Limitar tamaño de historial
    if (this.lastRespiratoryRates.length > 5) {
      this.lastRespiratoryRates.shift();
      this.lastConfidenceValues.shift();
      this.lastBreathAmplitudes.shift();
      this.lastIrregularityScores.shift();
    }
    
    // Calcular promedio de valores recientes
    const avgRate = this.lastRespiratoryRates.reduce((sum, rate) => sum + rate, 0) / this.lastRespiratoryRates.length;
    const avgConfidence = this.lastConfidenceValues.reduce((sum, conf) => sum + conf, 0) / this.lastConfidenceValues.length;
    const avgAmplitude = this.lastBreathAmplitudes.reduce((sum, amp) => sum + amp, 0) / this.lastBreathAmplitudes.length;
    const avgIrregularity = this.lastIrregularityScores.reduce((sum, score) => sum + score, 0) / this.lastIrregularityScores.length;
    
    // Actualizar valores actuales con suavizado
    if (this.currentRespRate === 0) {
      // Primera actualización
      this.currentRespRate = avgRate;
      this.currentConfidence = avgConfidence;
      this.currentAmplitude = avgAmplitude;
      this.currentIrregularityScore = avgIrregularity;
    } else {
      // Aplicar suavizado exponencial
      this.currentRespRate = this.currentRespRate * (1 - this.SMOOTHING_FACTOR) + avgRate * this.SMOOTHING_FACTOR;
      this.currentConfidence = this.currentConfidence * (1 - this.SMOOTHING_FACTOR) + avgConfidence * this.SMOOTHING_FACTOR;
      this.currentAmplitude = this.currentAmplitude * (1 - this.SMOOTHING_FACTOR) + avgAmplitude * this.SMOOTHING_FACTOR;
      this.currentIrregularityScore = this.currentIrregularityScore * (1 - this.SMOOTHING_FACTOR) + avgIrregularity * this.SMOOTHING_FACTOR;
    }
    
    // Actualizar patrón basado en valores actuales
    this.updateRespiratoryPattern();
  }
  
  /**
   * Actualizar patrón respiratorio basado en valores actuales
   */
  private updateRespiratoryPattern(): void {
    if (this.currentIrregularityScore > 40) {
      this.currentPattern = 'irregular';
    } else if (this.currentAmplitude < 0.15) {
      this.currentPattern = 'shallow';
    } else if (this.currentAmplitude > 0.5) {
      this.currentPattern = 'deep';
    } else {
      this.currentPattern = 'normal';
    }
  }
  
  /**
   * Aplicar filtro de media móvil a una señal
   */
  private applyMovingAverage(signal: number[], windowSize: number): number[] {
    const result = new Array(signal.length);
    
    for (let i = 0; i < signal.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let j = Math.max(0, i - Math.floor(windowSize / 2)); 
           j <= Math.min(signal.length - 1, i + Math.floor(windowSize / 2)); 
           j++) {
        sum += signal[j];
        count++;
      }
      
      result[i] = sum / count;
    }
    
    return result;
  }
  
  /**
   * Aplicar filtro paso bajo a una señal
   * @param signal Señal a filtrar
   * @param cutoffFreq Frecuencia de corte en Hz
   * @param samplingRate Frecuencia de muestreo en Hz
   */
  private applyLowPassFilter(signal: number[], cutoffFreq: number, samplingRate: number): number[] {
    const dt = 1 / samplingRate;
    const RC = 1 / (2 * Math.PI * cutoffFreq);
    const alpha = dt / (RC + dt);
    
    const result = new Array(signal.length);
    result[0] = signal[0];
    
    for (let i = 1; i < signal.length; i++) {
      result[i] = result[i - 1] + alpha * (signal[i] - result[i - 1]);
    }
    
    return result;
  }
} 