import { useState, useEffect, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../utils/HeartBeatProcessor';

export function useHeartBeatProcessor() {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [bpm, setBpm] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const [isPeak, setIsPeak] = useState<boolean>(false);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<number>(0);
  const lastProcessedValueRef = useRef<number>(0);
  const [audioInitialized, setAudioInitialized] = useState<boolean>(false);
  
  // Inicializar procesador
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new HeartBeatProcessor();
      console.log("useHeartBeatProcessor: Procesador de latidos inicializado");
      
      // Intentar inicializar audio automáticamente
      setTimeout(() => {
        if (processorRef.current) {
          processorRef.current.ensureAudioInitialized()
            .then(success => {
              console.log("useHeartBeatProcessor: Inicialización automática de audio:", success);
              setAudioInitialized(success);
            })
            .catch(err => {
              console.warn("useHeartBeatProcessor: Error en inicialización automática de audio:", err);
            });
        }
      }, 1000);
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
    if (value === lastProcessedValueRef.current || isNaN(value) || value === 0) {
      return { 
        bpm, 
        confidence, 
        isPeak: false, 
        filteredValue: value,
        arrhythmiaCount
      };
    }
    
    lastProcessedValueRef.current = value;
    
    // Asegurar que el audio esté inicializado
    if (!audioInitialized) {
      processorRef.current.ensureAudioInitialized()
        .then(success => {
          if (success) {
            console.log("useHeartBeatProcessor: Audio inicializado durante procesamiento");
            setAudioInitialized(true);
          }
        })
        .catch(() => {});
    }
    
    // Procesar señal usando el procesador
    const result = processorRef.current.processSignal(value);
    
    // Actualizar estado con los resultados
    setBpm(result.bpm);
    setConfidence(result.confidence);
    setIsPeak(result.isPeak);
    setArrhythmiaCount(result.arrhythmiaCount);
    
    // Log adicional para depuración
    if (result.isPeak) {
      console.log("useHeartBeatProcessor: PICO DETECTADO", {
        bpm: result.bpm,
        confidence: result.confidence,
        filteredValue: result.filteredValue
      });
    }
    
    return result;
  }, [bpm, confidence, arrhythmiaCount, audioInitialized]);
  
  // Función para inicializar audio (debe llamarse después de interacción del usuario)
  const initializeAudio = useCallback(async () => {
    if (processorRef.current) {
      try {
        console.log("useHeartBeatProcessor: Intentando inicializar audio...");
        
        // Intentar varias veces si falla
        let attempts = 0;
        let success = false;
        
        while (attempts < 3 && !success) {
          success = await processorRef.current.ensureAudioInitialized();
          if (!success) {
            console.log(`useHeartBeatProcessor: Intento ${attempts + 1} fallido, reintentando...`);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          attempts++;
        }
        
        console.log("useHeartBeatProcessor: Inicialización de audio completada:", success);
        setAudioInitialized(success);
        return success;
      } catch (error) {
        console.error("useHeartBeatProcessor: Error inicializando audio", error);
        setAudioInitialized(false);
        return false;
      }
    }
    return false;
  }, []);
  
  // Función para solicitar un beep manual
  const requestBeep = useCallback(async () => {
    if (processorRef.current) {
      try {
        console.log("useHeartBeatProcessor: Solicitando beep manual...");
        
        // Asegurar que el audio esté inicializado primero
        if (!audioInitialized) {
          const initialized = await initializeAudio();
          if (!initialized) {
            console.warn("useHeartBeatProcessor: No se pudo inicializar audio para beep manual");
            return false;
          }
        }
        
        // Solicitar beep con volumen alto
        const success = await processorRef.current.requestManualBeep();
        console.log("useHeartBeatProcessor: Beep manual completado:", success);
        return success;
      } catch (error) {
        console.error("useHeartBeatProcessor: Error solicitando beep manual", error);
        return false;
      }
    }
    return false;
  }, [audioInitialized, initializeAudio]);
  
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
    getFinalBPM,
    audioInitialized
  };
}
