
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    // Si detectamos una nueva arritmia, incrementamos el contador
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA" && 
        result.arrhythmiaStatus !== "SIN ARRITMIAS") {
      setArrhythmiaCounter(prev => prev + 1);
    }
    
    return {
      ...result,
      arrhythmiaStatus: arrhythmiaCounter.toString()
    };
  }, [processor, arrhythmiaCounter]);

  const reset = useCallback(() => {
    processor.reset();
    setArrhythmiaCounter(0);
  }, [processor]);

  return {
    processSignal,
    reset,
    arrhythmiaCounter
  };
};
