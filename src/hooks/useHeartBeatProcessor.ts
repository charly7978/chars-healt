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
  const initializationAttempts = useRef<number>(0);
  
  // Inicializar procesador
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new HeartBeatProcessor();
      console.log("useHeartBeatProcessor: Procesador de latidos inicializado");
      
      // Intentar inicializar audio automáticamente con múltiples intentos
      const tryInitAudio = () => {
        if (processorRef.current && initializationAttempts.current < 5) {
          initializationAttempts.current++;
          console.log(`useHeartBeatProcessor: Intento de inicialización de audio #${initializationAttempts.current}`);
          
          processorRef.current.ensureAudioInitialized()
            .then(success => {
              console.log("useHeartBeatProcessor: Inicialización automática de audio:", success);
              if (success) {
                setAudioInitialized(true);
                // Reproducir un beep de prueba para verificar
                processorRef.current?.requestManualBeep()
                  .then(beepSuccess => {
                    console.log("useHeartBeatProcessor: Beep de prueba:", beepSuccess);
                  });
              } else if (initializationAttempts.current < 5) {
                // Reintentar después de un breve retraso
                setTimeout(tryInitAudio, 1000);
              }
            })
            .catch(err => {
              console.warn("useHeartBeatProcessor: Error en inicialización automática de audio:", err);
              if (initializationAttempts.current < 5) {
                setTimeout(tryInitAudio, 1000);
              }
            });
        }
      };
      
      // Iniciar intentos después de un breve retraso
      setTimeout(tryInitAudio, 500);
    }
    
    return () => {
      // Limpiar recursos si es necesario
      if (processorRef.current) {
        console.log("useHeartBeatProcessor: Limpiando recursos");
      }
    };
  }, []);
  
  // Función para procesar nueva señal
  const processSignal = useCallback((value: number) => {
    if (!processorRef.current) return { bpm: 0, confidence: 0, isPeak: false, filteredValue: value, arrhythmiaCount: 0 };
    
    // Evitar procesamiento de valores inválidos pero permitir valores cercanos a cero
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
    
    // Asegurar que el audio esté inicializado
    if (!audioInitialized && initializationAttempts.current < 10) {
      initializationAttempts.current++;
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
    if (result.bpm > 0) {
      setBpm(result.bpm);
    }
    setConfidence(result.confidence);
    setIsPeak(result.isPeak);
    setArrhythmiaCount(result.arrhythmiaCount);
    
    // Log adicional para depuración
    if (result.isPeak) {
      console.log("useHeartBeatProcessor: PICO DETECTADO", {
        bpm: result.bpm,
        confidence: result.confidence,
        filteredValue: result.filteredValue,
        value: value // Valor original para depuración
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
        
        while (attempts < 5 && !success) {
          success = await processorRef.current.ensureAudioInitialized();
          if (!success) {
            console.log(`useHeartBeatProcessor: Intento ${attempts + 1} fallido, reintentando...`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          attempts++;
        }
        
        console.log("useHeartBeatProcessor: Inicialización de audio completada:", success);
        setAudioInitialized(success);
        
        // Si se inicializó correctamente, reproducir un beep de prueba
        if (success) {
          setTimeout(async () => {
            await processorRef.current?.requestManualBeep();
            console.log("useHeartBeatProcessor: Beep de prueba reproducido");
          }, 300);
        }
        
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
      lastProcessedValueRef.current = 0;
      initializationAttempts.current = 0;
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
