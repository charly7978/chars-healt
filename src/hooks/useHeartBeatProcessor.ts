
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
  // Buffers para mejor análisis de señal
  const recentValuesRef = useRef<number[]>([]);
  const recentConfidencesRef = useRef<number[]>([]);
  const MIN_CONFIDENCE_THRESHOLD = 0.5; // Reducido para captar más señales reales
  const BPM_HISTORY_SIZE = 10; // Tamaño de historial para estabilidad
  const bpmHistoryRef = useRef<number[]>([]);

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
      bpmHistoryRef.current = [];
    };
  }, []);

  // Función para obtener mediana
  const getMedian = (values: number[]): number => {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  };

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
    if (signalBufferRef.current.length > 300) {
      signalBufferRef.current = signalBufferRef.current.slice(-300);
    }

    // Aplicar filtro mínimo solo para estabilidad
    const filteredValue = applyBasicFilter(value);
    
    // Procesar la señal con el valor filtrado
    const result = processorRef.current.processSignal(filteredValue);
    const rrData = processorRef.current.getRRIntervals();

    // Almacenar valores recientes
    recentValuesRef.current.push(filteredValue);
    recentConfidencesRef.current.push(result.confidence);
    
    if (recentValuesRef.current.length > 10) {
      recentValuesRef.current.shift();
      recentConfidencesRef.current.shift();
    }

    // Validar picos para eliminar falsos positivos extremos
    const validatedResult = validatePeak(result);
    
    // Almacenar BPM en historial para estabilidad
    if (validatedResult.bpm > 40 && validatedResult.bpm < 200) {
      bpmHistoryRef.current.push(validatedResult.bpm);
      if (bpmHistoryRef.current.length > BPM_HISTORY_SIZE) {
        bpmHistoryRef.current.shift();
      }
    }
    
    // Usar valor directo si hay buena confianza, o mediana si hay suficiente historial
    let finalBpm = validatedResult.bpm;
    if (bpmHistoryRef.current.length >= 3) {
      const medianBpm = getMedian(bpmHistoryRef.current);
      // Usar mediana solo si el valor actual es muy diferente
      if (Math.abs(finalBpm - medianBpm) > 10) {
        finalBpm = medianBpm;
      }
    }

    console.log('useHeartBeatProcessor - result:', {
      bpm: result.bpm,
      validatedBpm: validatedResult.bpm,
      finalBpm,
      confidence: result.confidence,
      isPeak: result.isPeak,
      validatedIsPeak: validatedResult.isPeak,
      arrhythmiaCount: result.arrhythmiaCount,
      rrIntervals: rrData.intervals,
      timestamp: new Date().toISOString()
    });
    
    if (finalBpm > 0) {
      setCurrentBPM(finalBpm);
      setConfidence(validatedResult.confidence);
    }

    return {
      ...validatedResult,
      bpm: finalBpm,  // Usar BPM estabilizado
      rrData
    };
  }, []);

  // Filtro básico para eliminar solo ruidos extremos
  const applyBasicFilter = (value: number): number => {
    const windowSize = 3;
    recentValuesRef.current.push(value);
    
    if (recentValuesRef.current.length > windowSize) {
      recentValuesRef.current.shift();
    }
    
    if (recentValuesRef.current.length === windowSize) {
      const sorted = [...recentValuesRef.current].sort((a, b) => a - b);
      return sorted[Math.floor(windowSize / 2)];
    }
    
    return value;
  };

  // Validación básica de picos para eliminar valores no fisiológicos
  const validatePeak = (result: HeartBeatResult): HeartBeatResult => {
    if (!result.isPeak) {
      return result;
    }
    
    // Verificar si la confianza está por encima del umbral mínimo
    if (result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      return { ...result, isPeak: false };
    }
    
    // Si el BPM está fuera de rango fisiológico normal, requerir mayor confianza
    if ((result.bpm < 40 || result.bpm > 180) && result.confidence < 0.7) {
      return { ...result, isPeak: false };
    }
    
    // Validar la consistencia solo para BPM extremos
    if (result.bpm < 30 || result.bpm > 200) {
      if (recentConfidencesRef.current.length >= 3) {
        const avgConfidence = recentConfidencesRef.current
          .slice(-3)
          .reduce((sum, conf) => sum + conf, 0) / 3;
        
        if (avgConfidence < 0.65) {
          return { ...result, isPeak: false };
        }
      }
    }
    
    return result;
  };

  const reset = useCallback(() => {
    console.log('useHeartBeatProcessor: Reseteando processor');
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setCurrentBPM(0);
    setConfidence(0);
    
    // Limpiar todos los buffers
    signalBufferRef.current = [];
    recentValuesRef.current = [];
    recentConfidencesRef.current = [];
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
    cleanMemory
  };
};
