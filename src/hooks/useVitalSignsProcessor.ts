
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [hasDetectedArrhythmia, setHasDetectedArrhythmia] = useState(false);
  const [arrhythmiaCount, setArrhythmiaCount] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    
    // Si no estamos monitoreando, retornamos --
    if (!isMonitoring) {
      result.arrhythmiaStatus = "--";
      return result;
    }

    // Procesar el resultado y actualizar estados
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      if (!hasDetectedArrhythmia) {
        setHasDetectedArrhythmia(true);
        setArrhythmiaCount(prev => prev + 1);
      }
      result.arrhythmiaStatus = `${arrhythmiaCount + 1} ARRITMIAS DETECTADAS`;
    } else {
      // Si no hay arritmia en este frame
      result.arrhythmiaStatus = hasDetectedArrhythmia 
        ? `${arrhythmiaCount} ARRITMIAS DETECTADAS` 
        : "SIN ARRITMIAS";
    }
    
    return result;
  }, [processor, hasDetectedArrhythmia, arrhythmiaCount, isMonitoring]);

  const reset = useCallback(() => {
    processor.reset();
    setHasDetectedArrhythmia(false);
    setArrhythmiaCount(0);
    setIsMonitoring(false);
  }, [processor]);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
    setHasDetectedArrhythmia(false);
    setArrhythmiaCount(0);
  }, []);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    if (hasDetectedArrhythmia) {
      return {
        spo2: 0,
        pressure: "--/--",
        arrhythmiaStatus: `${arrhythmiaCount} ARRITMIAS DETECTADAS`
      };
    }
    return null;
  }, [hasDetectedArrhythmia, arrhythmiaCount]);

  return {
    processSignal,
    reset,
    startMonitoring,
    stopMonitoring
  };
};
