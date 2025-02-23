
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1500; // Aumentado para reducir falsos positivos
  const MAX_ARRHYTHMIAS_PER_SESSION = 15;
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    const currentTime = Date.now();
    
    // Validar que los valores no sean undefined o null
    const spo2 = typeof result.spo2 === 'number' ? Math.max(80, Math.min(100, result.spo2)) : 95;
    const [systolic, diastolic] = (result.pressure || '120/80').split('/').map(Number);
    
    // Asegurar que pressure tenga valores válidos
    const validatedPressure = isNaN(systolic) || isNaN(diastolic) ? '120/80' : 
                             `${Math.max(90, Math.min(180, systolic))}/${Math.max(50, Math.min(120, diastolic))}`;
    
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      if (
        currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
        arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION &&
        rrData?.intervals.length >= 4 // Aumentado para más precisión
      ) {
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
        console.log("Nueva arritmia detectada:", {
          total: arrhythmiaCounter + 1,
          timeGap: currentTime - lastArrhythmiaTime.current,
          signalQuality: rrData.intervals.length
        });
      }
    }
    
    const status = arrhythmiaCounter > 0 ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS";
    
    return {
      spo2,
      pressure: validatedPressure,
      arrhythmiaStatus: `${status}|${arrhythmiaCounter}`
    };
  }, [processor, arrhythmiaCounter]);

  const reset = useCallback(() => {
    processor.reset();
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    console.log("Reseteo de detección de arritmias");
  }, [processor]);

  return {
    processSignal,
    reset,
    arrhythmiaCounter
  };
};
