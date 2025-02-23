
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [hasDetectedArrhythmia, setHasDetectedArrhythmia] = useState(false);
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    // Si se detecta una arritmia, marcamos el flag y sumamos al contador
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA" || (typeof result.arrhythmiaStatus === 'number' && result.arrhythmiaStatus > 0)) {
      if (!hasDetectedArrhythmia) {
        setArrhythmiaCounter(prev => prev + 1);
      }
      setHasDetectedArrhythmia(true);
    }
    
    // Si ya se detectó una arritmia anteriormente, mantenemos el mensaje
    if (hasDetectedArrhythmia) {
      result.arrhythmiaStatus = "ARRITMIA DETECTADA";
    }
    
    // Agregamos el contador al objeto result sin modificar el mensaje
    result.arrhythmiaCount = arrhythmiaCounter;
    
    return result;
  }, [processor, hasDetectedArrhythmia, arrhythmiaCounter]);

  const reset = useCallback(() => {
    processor.reset();
    setHasDetectedArrhythmia(false);
    setArrhythmiaCounter(0);
  }, [processor]);

  return {
    processSignal,
    reset,
    arrhythmiaCounter
  };
};
