<<<<<<< Updated upstream

import { useState, useEffect, useCallback, useRef } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';
=======
import { useState, useEffect, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../utils/HeartBeatProcessor';
>>>>>>> Stashed changes

export function useHeartBeatProcessor() {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
<<<<<<< Updated upstream
  const [currentBPM, setCurrentBPM] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);

=======
  const [bpm, setBpm] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const [isPeak, setIsPeak] = useState<boolean>(false);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<number>(0);
  const lastProcessedValueRef = useRef<number>(0);
  
  // Inicializar procesador
>>>>>>> Stashed changes
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new HeartBeatProcessor();
      console.log("useHeartBeatProcessor: Procesador de latidos inicializado");
    }
    
    return () => {
      // No es necesario limpiar nada aquí, pero podríamos pausar el audio
      // si fuera necesario
    };
  }, []);
  
  // Función para procesar nueva señal
  const processSignal = useCallback((value: number) => {
    if (!processorRef.current) return { bpm: 0, confidence: 0, isPeak: false, filteredValue: value, arrhythmiaCount: 0 };
    
    // Evitar procesamiento de valores duplicados o inválidos
    if (value === lastProcessedValueRef.current || isNaN(value)) {
      return { 
        bpm, 
        confidence, 
        isPeak: false, 
        filteredValue: value,
        arrhythmiaCount
      };
    }
    
    lastProcessedValueRef.current = value;
    
    // Procesar señal usando el procesador
    const result = processorRef.current.processSignal(value);
    
    // Actualizar estado con los resultados
    setBpm(result.bpm);
    setConfidence(result.confidence);
    setIsPeak(result.isPeak);
    setArrhythmiaCount(result.arrhythmiaCount);
    
    return result;
  }, [bpm, confidence, arrhythmiaCount]);
  
  // Función para inicializar audio (debe llamarse después de interacción del usuario)
  const initializeAudio = useCallback(async () => {
    if (processorRef.current) {
      return await processorRef.current.ensureAudioInitialized();
    }
    return false;
  }, []);
  
  // Función para solicitar un beep manual
  const requestBeep = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.requestManualBeep();
    }
  }, []);
  
  // Función para resetear el procesador
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
      setBpm(0);
      setConfidence(0);
      setIsPeak(false);
      setArrhythmiaCount(0);
      console.log("useHeartBeatProcessor: Procesador reseteado");
    }
  }, []);
  
  // Función para obtener la calidad de señal
  const getSignalQuality = useCallback(() => {
    if (processorRef.current) {
      return processorRef.current.getSignalQuality();
    }
    return 0;
  }, []);
  
  // Función para obtener BPM final (después de medición)
  const getFinalBPM = useCallback(() => {
    if (processorRef.current) {
      return processorRef.current.getFinalBPM();
    }
    return 0;
  }, []);
  
  return {
    processSignal,
    bpm,
    confidence,
    isPeak,
    arrhythmiaCount,
    initializeAudio,
    requestBeep,
    reset,
    getSignalQuality,
    getFinalBPM
  };
}
