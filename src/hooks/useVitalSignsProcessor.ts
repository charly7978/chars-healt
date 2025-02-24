
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
    
    // Análisis más riguroso de intervalos RR para arritmias
    if (rrData?.intervals && rrData.intervals.length >= 3) {
      const lastThreeIntervals = rrData.intervals.slice(-3);
      const avgRR = lastThreeIntervals.reduce((a, b) => a + b, 0) / lastThreeIntervals.length;
      
      // Calculamos la variabilidad usando RMSSD (Root Mean Square of Successive Differences)
      let rmssd = 0;
      for (let i = 1; i < lastThreeIntervals.length; i++) {
        rmssd += Math.pow(lastThreeIntervals[i] - lastThreeIntervals[i-1], 2);
      }
      rmssd = Math.sqrt(rmssd / (lastThreeIntervals.length - 1));
      
      // Criterios más estrictos para arritmias:
      // 1. RMSSD > 50ms (alta variabilidad)
      // 2. Último intervalo RR significativamente diferente del promedio (>20%)
      // 3. Suficiente tiempo desde la última arritmia
      const lastRR = lastThreeIntervals[lastThreeIntervals.length - 1];
      const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
      
      if (rmssd > 50 && 
          rrVariation > 0.20 && 
          currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
          arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION) {
        
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
        
        console.log("Arritmia detectada:", {
          rmssd,
          rrVariation,
          lastRR,
          avgRR,
          intervals: lastThreeIntervals,
          counter: arrhythmiaCounter + 1
        });

        return {
          spo2: result.spo2,
          pressure: result.pressure,
          arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
          lastArrhythmiaData: {
            timestamp: currentTime,
            rmssd,
            rrVariation
          }
        };
      }
    }
    
    const status = arrhythmiaCounter > 0 ? 
      `ARRITMIAS DETECTADAS|${arrhythmiaCounter}` : 
      `SIN ARRITMIAS|${arrhythmiaCounter}`;
    
    return {
      spo2: result.spo2,
      pressure: result.pressure,
      arrhythmiaStatus: status
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
