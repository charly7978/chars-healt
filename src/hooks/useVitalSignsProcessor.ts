
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

    // Si acabamos de empezar a monitorear y no hay arritmias aún
    if (!hasDetectedArrhythmia) {
      result.arrhythmiaStatus = "SIN ARRITMIAS";
    }
    
    // Si se detecta una arritmia
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      setHasDetectedArrhythmia(true);
      setArrhythmiaCount(prev => prev + 1);
    }
    
    // Si ya se detectó una arritmia anteriormente
    if (hasDetectedArrhythmia) {
      result.arrhythmiaStatus = "ARRITMIA DETECTADA";
    }
    
    return result;
  }, [processor, hasDetectedArrhythmia, isMonitoring]);

  const reset = useCallback(() => {
    processor.reset();
    setHasDetectedArrhythmia(false);
    setArrhythmiaCount(0);
    setIsMonitoring(false);
  }, [processor]);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    if (hasDetectedArrhythmia) {
      // Al detener, si hubo arritmias, mostramos el conteo total
      return {
        spo2: 0,
        pressure: "--/--",
        arrhythmiaStatus: arrhythmiaCount
      };
    }
    setIsMonitoring(false);
  }, [hasDetectedArrhythmia, arrhythmiaCount]);

  return {
    processSignal,
    reset,
    startMonitoring,
    stopMonitoring
  };
};
