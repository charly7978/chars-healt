
import { useState, useEffect, useCallback, useRef } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue?: number;
  arrhythmiaCount: number;
  rrData?: {
    intervals: number[];
    lastPeakTime: number | null;
  };
}

export const useHeartBeatProcessor = () => {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [currentBPM, setCurrentBPM] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const signalBufferRef = useRef<number[]>([]);
  const audioEnabledRef = useRef<boolean>(true); // Activar el beep por defecto
  
  // Buffers mejorados para filtrado de señal
  const recentValuesRef = useRef<number[]>([]);
  const recentConfidencesRef = useRef<number[]>([]);
  const peakHistoryRef = useRef<{time: number, value: number}[]>([]);
  const bpmHistoryRef = useRef<{time: number, bpm: number, confidence: number}[]>([]);
  
  // Parámetros optimizados
  const MIN_CONFIDENCE_THRESHOLD = 0.70; // Aumentado para reducir falsos positivos
  const MEDIAN_FILTER_WINDOW = 7;        // Tamaño de ventana para filtro de mediana
  const CONFIDENCE_HISTORY_SIZE = 15;    // Historial de confianza para análisis
  const PEAK_HISTORY_SIZE = 20;          // Historial de picos para análisis
  const BPM_HISTORY_SIZE = 15;           // Historial de BPM para estabilidad
  const BPM_OUTLIER_THRESHOLD = 0.30;    // Umbral para detección de valores atípicos (30%)
  const SIGNAL_QUALITY_THRESHOLD = 0.65; // Umbral mínimo de calidad de señal

  useEffect(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
    processorRef.current = new HeartBeatProcessor();
    
    if (typeof window !== 'undefined') {
      (window as any).heartBeatProcessor = processorRef.current;
    }

    return () => {
      console.log('useHeartBeatProcessor: Limpiando processor');
      if (processorRef.current) {
        processorRef.current = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).heartBeatProcessor = undefined;
      }
      // Limpiar buffers
      signalBufferRef.current = [];
      recentValuesRef.current = [];
      recentConfidencesRef.current = [];
      peakHistoryRef.current = [];
      bpmHistoryRef.current = [];
    };
  }, []);

  // Función para habilitar/deshabilitar el beep
  const setAudioEnabled = useCallback((enabled: boolean) => {
    audioEnabledRef.current = enabled;
    console.log(`Beep cardíaco ${enabled ? 'activado' : 'desactivado'}`);
  }, []);

  // Función mejorada para aplicar filtro de mediana
  const applyMedianFilter = useCallback((value: number): number => {
    recentValuesRef.current.push(value);
    
    if (recentValuesRef.current.length > MEDIAN_FILTER_WINDOW) {
      recentValuesRef.current.shift();
    }
    
    if (recentValuesRef.current.length === MEDIAN_FILTER_WINDOW) {
      // Copia el array para no modificar el original durante la ordenación
      const sorted = [...recentValuesRef.current].sort((a, b) => a - b);
      return sorted[Math.floor(MEDIAN_FILTER_WINDOW / 2)];
    }
    
    return value;
  }, [MEDIAN_FILTER_WINDOW]);

  // Nueva función para calcular la calidad de la señal
  const calculateSignalQuality = useCallback((value: number, confidence: number): number => {
    // Factores que contribuyen a la calidad
    const amplitudeFactor = Math.min(Math.abs(value) / 0.5, 1);
    const confidenceFactor = confidence;
    
    // Estabilidad basada en la varianza de los últimos valores
    let stabilityFactor = 1;
    if (recentValuesRef.current.length >= 5) {
      const recentValues = recentValuesRef.current.slice(-5);
      const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
      const variance = recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length;
      const normalizedStability = Math.max(0, Math.min(1, 1 - (variance / 0.1)));
      stabilityFactor = normalizedStability;
    }
    
    // Consistencia de picos
    let peakConsistencyFactor = 0.5;
    if (peakHistoryRef.current.length >= 3) {
      const recentPeaks = peakHistoryRef.current.slice(-3);
      const intervals = [];
      for (let i = 1; i < recentPeaks.length; i++) {
        intervals.push(recentPeaks[i].time - recentPeaks[i-1].time);
      }
      
      if (intervals.length >= 2) {
        const intervalVariation = Math.abs(intervals[1] - intervals[0]) / Math.max(intervals[0], 1);
        peakConsistencyFactor = Math.max(0, Math.min(1, 1 - intervalVariation));
      }
    }
    
    // Combinar factores con pesos optimizados
    return (
      amplitudeFactor * 0.3 + 
      confidenceFactor * 0.3 + 
      stabilityFactor * 0.2 + 
      peakConsistencyFactor * 0.2
    );
  }, []);

  // Función mejorada para validar si un pico es genuino
  const validatePeak = useCallback((result: HeartBeatResult): HeartBeatResult => {
    const currentTime = Date.now();
    
    // Si no es un pico, no hay nada que validar
    if (!result.isPeak) {
      return result;
    }
    
    // Verificar si la confianza está por encima del umbral
    if (result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      return { ...result, isPeak: false };
    }
    
    // Almacenar confianza para análisis
    recentConfidencesRef.current.push(result.confidence);
    if (recentConfidencesRef.current.length > CONFIDENCE_HISTORY_SIZE) {
      recentConfidencesRef.current.shift();
    }
    
    // Verificar la consistencia de los últimos valores de confianza
    if (recentConfidencesRef.current.length >= 5) {
      const avgConfidence = recentConfidencesRef.current
        .slice(-5)
        .reduce((sum, conf) => sum + conf, 0) / 5;
      
      // Si la confianza promedio es baja, es probable que sea un falso positivo
      if (avgConfidence < MIN_CONFIDENCE_THRESHOLD * 0.9) {
        return { ...result, isPeak: false };
      }
    }
    
    // Verificar consistencia temporal con picos anteriores
    if (peakHistoryRef.current.length >= 2) {
      const lastPeakTime = peakHistoryRef.current[peakHistoryRef.current.length - 1].time;
      const timeSinceLastPeak = currentTime - lastPeakTime;
      
      // Calcular intervalo promedio entre picos recientes
      let avgInterval = 0;
      let intervalCount = 0;
      
      for (let i = 1; i < peakHistoryRef.current.length; i++) {
        const interval = peakHistoryRef.current[i].time - peakHistoryRef.current[i-1].time;
        if (interval > 200 && interval < 2000) { // Rango válido para intervalos RR (30-300 BPM)
          avgInterval += interval;
          intervalCount++;
        }
      }
      
      if (intervalCount > 0) {
        avgInterval /= intervalCount;
        
        // Si el tiempo desde el último pico es demasiado corto (menos del 70% del intervalo promedio)
        // probablemente es un falso positivo
        if (timeSinceLastPeak < avgInterval * 0.7) {
          return { ...result, isPeak: false };
        }
      }
    }
    
    // Si pasa todas las validaciones, registrar el pico
    if (result.filteredValue !== undefined) {
      peakHistoryRef.current.push({
        time: currentTime,
        value: result.filteredValue
      });
      
      if (peakHistoryRef.current.length > PEAK_HISTORY_SIZE) {
        peakHistoryRef.current.shift();
      }
    }
    
    // Calcular calidad de señal
    const signalQuality = calculateSignalQuality(
      result.filteredValue || 0, 
      result.confidence
    );
    
    // Rechazar picos con calidad de señal muy baja
    if (signalQuality < SIGNAL_QUALITY_THRESHOLD) {
      return { ...result, isPeak: false };
    }
    
    // Es un pico genuino
    return result;
  }, [MIN_CONFIDENCE_THRESHOLD, CONFIDENCE_HISTORY_SIZE, PEAK_HISTORY_SIZE, SIGNAL_QUALITY_THRESHOLD, calculateSignalQuality]);

  // Función mejorada para estabilizar BPM
  const stabilizeBPM = useCallback((instantBPM: number, confidence: number): number => {
    const currentTime = Date.now();
    
    // Registrar BPM en historial
    bpmHistoryRef.current.push({
      time: currentTime,
      bpm: instantBPM,
      confidence
    });
    
    if (bpmHistoryRef.current.length > BPM_HISTORY_SIZE) {
      bpmHistoryRef.current.shift();
    }
    
    // Si no hay suficiente historial, devolver el valor actual
    if (bpmHistoryRef.current.length < 3) {
      return instantBPM;
    }
    
    // Calcular BPM promedio ponderado por confianza
    let totalWeight = 0;
    let weightedSum = 0;
    
    // Dar más peso a valores recientes y con alta confianza
    bpmHistoryRef.current.forEach((item, index) => {
      // Factor de recencia: valores más recientes tienen más peso
      const recencyFactor = (index + 1) / bpmHistoryRef.current.length;
      // Peso combinado
      const weight = item.confidence * recencyFactor;
      
      totalWeight += weight;
      weightedSum += item.bpm * weight;
    });
    
    if (totalWeight === 0) return instantBPM;
    
    const avgBPM = weightedSum / totalWeight;
    
    // Detectar y filtrar valores atípicos
    if (Math.abs(instantBPM - avgBPM) / avgBPM > BPM_OUTLIER_THRESHOLD) {
      console.log(`useHeartBeatProcessor: Valor atípico filtrado - BPM: ${instantBPM}, Promedio: ${avgBPM}`);
      return avgBPM;
    }
    
    // Aplicar suavizado adaptativo
    // Más suavizado cuando hay más historia y mayor variabilidad
    const variability = calculateBPMVariability();
    const adaptiveFactor = Math.min(0.3, 0.1 + variability * 0.2);
    
    return Math.round(instantBPM * adaptiveFactor + avgBPM * (1 - adaptiveFactor));
  }, [BPM_HISTORY_SIZE, BPM_OUTLIER_THRESHOLD]);

  // Nueva función para calcular la variabilidad del BPM
  const calculateBPMVariability = useCallback((): number => {
    if (bpmHistoryRef.current.length < 3) return 0;
    
    const bpmValues = bpmHistoryRef.current.map(item => item.bpm);
    const mean = bpmValues.reduce((sum, val) => sum + val, 0) / bpmValues.length;
    
    const squaredDiffs = bpmValues.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / bpmValues.length;
    
    // Normalizar variabilidad entre 0 y 1
    return Math.min(1, Math.sqrt(variance) / 10);
  }, []);

  const processSignal = useCallback((value: number): HeartBeatResult => {
    if (!processorRef.current) {
      console.warn('useHeartBeatProcessor: Processor no inicializado');
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        arrhythmiaCount: 0,
        rrData: {
          intervals: [],
          lastPeakTime: null
        }
      };
    }

    // Almacenar señal en buffer para análisis
    signalBufferRef.current.push(value);
    // Limitar tamaño del buffer para controlar memoria
    if (signalBufferRef.current.length > 300) {
      signalBufferRef.current = signalBufferRef.current.slice(-300);
    }

    // Aplicar filtrado mejorado para reducir ruido
    const filteredValue = applyMedianFilter(value);
    
    // Procesar la señal con el filtro aplicado
    // Pasar el estado de audio para que el HeartBeatProcessor sepa si debe emitir sonido
    const result = processorRef.current.processSignal(filteredValue, audioEnabledRef.current);
    const rrData = processorRef.current.getRRIntervals();

    // Validación mejorada de picos para eliminar falsos positivos
    const validatedResult = validatePeak({
      ...result,
      rrData
    });

    // Estabilizar BPM si es un valor válido
    let stabilizedBPM = validatedResult.bpm;
    if (validatedResult.bpm > 0 && validatedResult.confidence > MIN_CONFIDENCE_THRESHOLD * 0.8) {
      stabilizedBPM = stabilizeBPM(validatedResult.bpm, validatedResult.confidence);
    }

    if (stabilizedBPM > 0) {
      setCurrentBPM(stabilizedBPM);
      setConfidence(validatedResult.confidence);
    }

    return {
      ...validatedResult,
      bpm: stabilizedBPM,
      rrData
    };
  }, [applyMedianFilter, validatePeak, stabilizeBPM, MIN_CONFIDENCE_THRESHOLD]);

  const reset = useCallback(() => {
    console.log('useHeartBeatProcessor: Reseteando processor');
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setCurrentBPM(0);
    setConfidence(0);
    
    // Limpiar buffer de señales para liberar memoria
    signalBufferRef.current = [];
    recentValuesRef.current = [];
    recentConfidencesRef.current = [];
    peakHistoryRef.current = [];
    bpmHistoryRef.current = [];
    
    // Forzar garbage collection si está disponible
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, []);

  // Función para limpieza agresiva de memoria
  const cleanMemory = useCallback(() => {
    console.log('useHeartBeatProcessor: Limpieza agresiva de memoria');
    if (processorRef.current) {
      processorRef.current.reset();
    }
    
    // Limpiar estados
    setCurrentBPM(0);
    setConfidence(0);
    
    // Limpiar buffer de señales
    signalBufferRef.current = [];
    recentValuesRef.current = [];
    recentConfidencesRef.current = [];
    peakHistoryRef.current = [];
    bpmHistoryRef.current = [];
    
    // Recrear el procesador para asegurar limpieza completa
    processorRef.current = new HeartBeatProcessor();
    
    if (typeof window !== 'undefined') {
      (window as any).heartBeatProcessor = processorRef.current;
    }
    
    // Forzar garbage collection si está disponible
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, []);

  return {
    currentBPM,
    confidence,
    processSignal,
    reset,
    cleanMemory,
    setAudioEnabled,
    audioEnabled: audioEnabledRef.current
  };
};
