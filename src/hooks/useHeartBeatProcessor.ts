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
  
  // Buffers mejorados para filtrado de señal
  const recentValuesRef = useRef<number[]>([]);
  const recentConfidencesRef = useRef<number[]>([]);
  const peakValuesRef = useRef<number[]>([]);
  const bpmHistoryRef = useRef<number[]>([]);
  const confidenceHistoryRef = useRef<number[]>([]);
  const lastValidBpmTimeRef = useRef<number>(0);
  
  // Parámetros optimizados
  const MIN_CONFIDENCE_THRESHOLD = 0.70; // Aumentado para reducir falsos positivos
  const MEDIAN_FILTER_WINDOW = 7; // Tamaño de ventana para filtro de mediana
  const BPM_STABILITY_THRESHOLD = 8; // Máxima variación permitida para BPM estable
  const MIN_CONFIDENCE_FOR_STABLE_BPM = 0.75; // Confianza mínima para considerar BPM estable
  const MAX_BPM_HISTORY = 15; // Tamaño máximo del historial de BPM
  const BPM_SMOOTHING_FACTOR = 0.25; // Factor de suavizado para BPM (menor = más estable)
  const MIN_TIME_BETWEEN_BPM_UPDATES = 500; // Tiempo mínimo entre actualizaciones de BPM (ms)

  useEffect(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia optimizada de HeartBeatProcessor');
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
      peakValuesRef.current = [];
      bpmHistoryRef.current = [];
      confidenceHistoryRef.current = [];
    };
  }, []);

  // Función mejorada para aplicar filtro de mediana a la señal
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

  // Función mejorada para validar si un pico es genuino
  const validatePeak = useCallback((result: HeartBeatResult): HeartBeatResult => {
    // Si no es un pico, no hay nada que validar
    if (!result.isPeak) {
      return result;
    }
    
    // Verificar si la confianza está por encima del umbral
    if (result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      return { ...result, isPeak: false };
    }
    
    // Verificar la consistencia de los últimos valores de confianza
    if (recentConfidencesRef.current.length >= 3) {
      const avgConfidence = recentConfidencesRef.current
        .slice(-3)
        .reduce((sum, conf) => sum + conf, 0) / 3;
      
      // Si la confianza promedio es baja, es probable que sea un falso positivo
      if (avgConfidence < MIN_CONFIDENCE_THRESHOLD * 0.9) {
        return { ...result, isPeak: false };
      }
    }
    
    // Si es un pico válido, almacenar su valor filtrado para análisis
    if (result.filteredValue !== undefined) {
      peakValuesRef.current.push(result.filteredValue);
      if (peakValuesRef.current.length > 10) {
        peakValuesRef.current.shift();
      }
    }
    
    // Si pasa todas las validaciones, es un pico genuino
    return result;
  }, [MIN_CONFIDENCE_THRESHOLD]);

  // Función mejorada para estabilizar el BPM
  const stabilizeBPM = useCallback((bpm: number, confidence: number): number => {
    const currentTime = Date.now();
    
    // No actualizar si el tiempo desde la última actualización es muy corto
    if (currentTime - lastValidBpmTimeRef.current < MIN_TIME_BETWEEN_BPM_UPDATES) {
      return currentBPM;
    }
    
    // Almacenar BPM y confianza en historial
    if (bpm > 0) {
      bpmHistoryRef.current.push(bpm);
      confidenceHistoryRef.current.push(confidence);
      
      if (bpmHistoryRef.current.length > MAX_BPM_HISTORY) {
        bpmHistoryRef.current.shift();
        confidenceHistoryRef.current.shift();
      }
    }
    
    // Si no hay suficientes datos, devolver el BPM actual
    if (bpmHistoryRef.current.length < 3) {
      return bpm > 0 ? bpm : currentBPM;
    }
    
    // Calcular BPM ponderado por confianza
    let totalWeight = 0;
    let weightedSum = 0;
    
    // Dar más peso a valores recientes y con mayor confianza
    for (let i = 0; i < bpmHistoryRef.current.length; i++) {
      // Factor de recencia: valores más recientes tienen más peso
      const recencyFactor = 0.5 + (i / bpmHistoryRef.current.length) * 0.5;
      
      // Peso combinado: confianza * recencia
      const weight = confidenceHistoryRef.current[i] * recencyFactor;
      
      totalWeight += weight;
      weightedSum += bpmHistoryRef.current[i] * weight;
    }
    
    // Calcular BPM ponderado
    const weightedBPM = totalWeight > 0 ? weightedSum / totalWeight : bpm;
    
    // Aplicar suavizado exponencial para evitar cambios bruscos
    const smoothedBPM = currentBPM > 0 
      ? currentBPM * (1 - BPM_SMOOTHING_FACTOR) + weightedBPM * BPM_SMOOTHING_FACTOR
      : weightedBPM;
    
    // Verificar estabilidad
    const bpmDiff = Math.abs(smoothedBPM - currentBPM);
    const isStable = bpmDiff <= BPM_STABILITY_THRESHOLD && confidence >= MIN_CONFIDENCE_FOR_STABLE_BPM;
    
    // Actualizar tiempo de última actualización válida
    if (isStable || currentBPM === 0) {
      lastValidBpmTimeRef.current = currentTime;
    }
    
    return Math.round(smoothedBPM);
  }, [currentBPM, BPM_SMOOTHING_FACTOR, BPM_STABILITY_THRESHOLD, MIN_CONFIDENCE_FOR_STABLE_BPM, MIN_TIME_BETWEEN_BPM_UPDATES, MAX_BPM_HISTORY]);

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

    // Aplicar filtrado adicional para reducir ruido
    const filteredValue = applyMedianFilter(value);
    
    // Procesar la señal con el filtro aplicado
    const result = processorRef.current.processSignal(filteredValue);
    const rrData = processorRef.current.getRRIntervals();

    // Almacenar valores de confianza para validación
    recentConfidencesRef.current.push(result.confidence);
    if (recentConfidencesRef.current.length > 10) {
      recentConfidencesRef.current.shift();
    }

    // Validación de picos para eliminar falsos positivos
    const validatedResult = validatePeak(result);

    // Si es un pico válido, actualizar BPM
    if (validatedResult.isPeak && validatedResult.bpm > 0) {
      const stabilizedBPM = stabilizeBPM(validatedResult.bpm, validatedResult.confidence);
      setCurrentBPM(stabilizedBPM);
      setConfidence(validatedResult.confidence);
    }

    return {
      ...validatedResult,
      rrData
    };
  }, [applyMedianFilter, validatePeak, stabilizeBPM]);

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
    peakValuesRef.current = [];
    bpmHistoryRef.current = [];
    confidenceHistoryRef.current = [];
    lastValidBpmTimeRef.current = 0;
    
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
    peakValuesRef.current = [];
    bpmHistoryRef.current = [];
    confidenceHistoryRef.current = [];
    lastValidBpmTimeRef.current = 0;
    
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
    cleanMemory
  };
};
