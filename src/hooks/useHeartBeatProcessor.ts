import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export const useHeartBeatProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
      processorRef.current = new HeartBeatProcessor();
      // Make it globally accessible for debugging
      (window as any).heartBeatProcessor = processorRef.current;
    }
    return processorRef.current;
  }, []);
  
  const processSignal = useCallback((value: number) => {
    try {
      const processor = getProcessor();
      const result = processor.processSignal(value);
      
      // Update state with the latest results
      setBpm(result.bpm);
      setConfidence(result.confidence);
      setIsPeak(result.isPeak);
      
      // CRÍTICO: Obtener RR intervals Y amplitudes para detección de arritmias
      const rrData = processor.getRRIntervals();
      
      // Verificar si tenemos datos para detección de arritmias
      if (rrData.intervals.length > 0) {
        // Log para debug - verificar que estamos obteniendo amplitudes
        if (result.isPeak && (!rrData.amplitudes || rrData.amplitudes.length === 0)) {
          console.warn('ALERTA: Pico detectado pero sin amplitudes asociadas');
        }
      }
      
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        isPeak: result.isPeak,
        rrData: rrData  // Asegurar que incluya amplitudes
      };
    } catch (error) {
      console.error('Error processing signal:', error);
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        rrData: { intervals: [], lastPeakTime: null, amplitudes: [] }
      };
    }
  }, [getProcessor]);
  
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    console.log('useHeartBeatProcessor: Reset completo');
  }, []);
  
  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    return processorRef.current.getFinalBPM();
  }, []);
  
  const cleanMemory = useCallback(() => {
    console.log("useHeartBeatProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.reset();
      processorRef.current = null;
    }
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    
    // Force garbage collection if available
    if ((window as any).gc) {
      try {
        (window as any).gc();
      } catch (e) {
        console.log("GC no disponible en este entorno");
      }
    }
  }, []);
  
  return {
    bpm,
    confidence,
    isPeak,
    processSignal,
    reset,
    getFinalBPM,
    cleanMemory
  };
};
