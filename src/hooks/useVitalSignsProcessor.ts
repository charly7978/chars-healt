
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      setArrhythmiaCounter(prev => prev + 1);
    }
    
    return {
      spo2: result.spo2,
      pressure: result.pressure,
      arrhythmiaStatus: arrhythmiaCounter > 0 ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS"
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
