
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [hasDetectedArrhythmia, setHasDetectedArrhythmia] = useState(false);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    // Si se detecta una arritmia, marcamos el flag
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA" || (typeof result.arrhythmiaStatus === 'number' && result.arrhythmiaStatus > 0)) {
      setHasDetectedArrhythmia(true);
    }
    
    // Si ya se detectó una arritmia anteriormente, mantenemos el mensaje
    if (hasDetectedArrhythmia) {
      result.arrhythmiaStatus = "ARRITMIA DETECTADA";
    }
    
    return result;
  }, [processor, hasDetectedArrhythmia]);

  const reset = useCallback(() => {
    processor.reset();
    setHasDetectedArrhythmia(false);
  }, [processor]);

  return {
    processSignal,
    reset
  };
};
