
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [hasDetectedArrhythmia, setHasDetectedArrhythmia] = useState(false);
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      if (!hasDetectedArrhythmia) {
        setArrhythmiaCounter(prev => prev + 1);
        setHasDetectedArrhythmia(true);
      }
    } else {
      setHasDetectedArrhythmia(false);
    }
    
    return {
      ...result,
      arrhythmiaStatus: arrhythmiaCounter > 0 ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS"
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
