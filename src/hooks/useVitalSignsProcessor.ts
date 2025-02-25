
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);

  const processSignal = useCallback((value: number) => {
    const result = processor.processSignal(value);
    const currentTime = Date.now();
    
    // Process result and update state
    if (result) {
      hasDetectedArrhythmia.current = result.arrhythmia.status === "ARRITMIA DETECTADA";
      
      if (hasDetectedArrhythmia.current) {
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
      }

      return {
        spo2: result.spo2,
        pressure: result.pressure,
        arrhythmiaStatus: `${result.arrhythmia.status}|${arrhythmiaCounter}`,
        lastArrhythmiaData: result.arrhythmia.data
      };
    }

    return {
      spo2: 0,
      pressure: "--/--",
      arrhythmiaStatus: "SIN ARRITMIAS|0",
      lastArrhythmiaData: null
    };
  }, [arrhythmiaCounter, processor]);

  const reset = useCallback(() => {
    processor.reset();
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
  }, [processor]);

  return {
    processSignal,
    reset
  };
};
