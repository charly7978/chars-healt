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
    amplitude?: number;
  };
}

export const useHeartBeatProcessor = () => {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [currentBPM, setCurrentBPM] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const signalBufferRef = useRef<number[]>([]);
  // Nuevos buffers para mejora de filtrado de señal
  const recentValuesRef = useRef<number[]>([]);
  const recentConfidencesRef = useRef<number[]>([]);
  const MIN_CONFIDENCE_THRESHOLD = 0.65; // Aumentado para reducir falsos positivos

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
      // Limpiar buffer
      signalBufferRef.current = [];
      recentValuesRef.current = [];
      recentConfidencesRef.current = [];
    };
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

    console.log('useHeartBeatProcessor - processSignal:', {
      inputValue: value,
      currentProcessor: !!processorRef.current,
      timestamp: new Date().toISOString()
    });

    // Almacenar señal en buffer para análisis
    signalBufferRef.current.push(value);
    // Limitar tamaño del buffer para controlar memoria
    if (signalBufferRef.current.length > 300) {
      signalBufferRef.current = signalBufferRef.current.slice(-300);
    }

    // Aplicar filtrado adicional para reducir ruido
    // 1. Filtro de mediana para eliminar picos aleatorios
    const filteredValue = applyMedianFilter(value);
    
    // 2. Procesar la señal con el filtro aplicado
    const result = processorRef.current.processSignal(filteredValue);
    const rrData = processorRef.current.getRRIntervals();

    // 3. Almacenar valores recientes para validación
    recentValuesRef.current.push(filteredValue);
    recentConfidencesRef.current.push(result.confidence);
    
    if (recentValuesRef.current.length > 10) {
      recentValuesRef.current.shift();
      recentConfidencesRef.current.shift();
    }

    // 4. Validación de picos para eliminar falsos positivos
    const validatedResult = validatePeak(result);

    console.log('useHeartBeatProcessor - result:', {
      bpm: result.bpm,
      confidence: result.confidence,
      isPeak: result.isPeak,
      validatedIsPeak: validatedResult.isPeak,
      arrhythmiaCount: result.arrhythmiaCount,
      rrIntervals: rrData.intervals,
      timestamp: new Date().toISOString()
    });
    
    if (validatedResult.bpm > 0) {
      setCurrentBPM(validatedResult.bpm);
      setConfidence(validatedResult.confidence);
    }

    return {
      ...validatedResult,
      rrData: {
        ...rrData,
        amplitude: validatedResult.isPeak ? Math.abs(filteredValue) : undefined
      }
    };
  }, []);

  // Función para aplicar filtro de mediana a la señal
  const applyMedianFilter = (value: number): number => {
    const windowSize = 5;
    recentValuesRef.current.push(value);
    
    if (recentValuesRef.current.length > windowSize) {
      recentValuesRef.current.shift();
    }
    
    if (recentValuesRef.current.length === windowSize) {
      // Copia el array para no modificar el original durante la ordenación
      const sorted = [...recentValuesRef.current].sort((a, b) => a - b);
      return sorted[Math.floor(windowSize / 2)];
    }
    
    return value;
  };

  // Función para validar si un pico es genuino basado en consistencia y confianza
  const validatePeak = (result: HeartBeatResult): HeartBeatResult => {
    // Si no es un pico, no hay nada que validar
    if (!result.isPeak) {
      return result;
    }
    
    // Verificar si la confianza está por encima del umbral
    if (result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      return { ...result, isPeak: false };
    }
    
    // Verificar la consistencia de los últimos valores
    if (recentConfidencesRef.current.length >= 3) {
      const avgConfidence = recentConfidencesRef.current
        .slice(-3)
        .reduce((sum, conf) => sum + conf, 0) / 3;
      
      // Si la confianza promedio es baja, es probable que sea un falso positivo
      if (avgConfidence < MIN_CONFIDENCE_THRESHOLD) {
        return { ...result, isPeak: false };
      }
    }
    
    // Si pasa todas las validaciones, es un pico genuino
    return result;
  };

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
