
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [hasDetectedArrhythmia, setHasDetectedArrhythmia] = useState(false);
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    // Si se detecta una arritmia, marcamos el flag y sumamos al contador
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      if (!hasDetectedArrhythmia) {
        setArrhythmiaCounter(prev => prev + 1);
      }
      setHasDetectedArrhythmia(true);
    }
    
    // Retornamos el contador como arrhythmiaStatus si hay arritmias detectadas
    return {
      ...result,
      arrhythmiaStatus: arrhythmiaCounter > 0 ? arrhythmiaCounter : result.arrhythmiaStatus
    };
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
