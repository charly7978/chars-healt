
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // Mínimo 1 segundo entre arritmias
  const MAX_ARRHYTHMIAS_PER_SESSION = 15; // Máximo razonable para 30 segundos
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    const currentTime = Date.now();
    
    if (result.arrhythmiaStatus === "ARRITMIA DETECTADA") {
      // Solo contar si:
      // 1. Ha pasado suficiente tiempo desde la última
      // 2. No hemos llegado al máximo
      // 3. La señal tiene buena calidad (usamos los datos RR como indicador)
      if (
        currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
        arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION &&
        rrData?.intervals.length >= 3 // Aseguramos tener suficientes datos
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
      spo2: result.spo2,
      pressure: result.pressure,
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
