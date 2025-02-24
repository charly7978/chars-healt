
import { useState, useCallback, useRef } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000;
  const MAX_ARRHYTHMIAS_PER_SESSION = 15;
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    const result = processor.processSignal(value, rrData);
    const currentTime = Date.now();

    // Análisis de arritmias
    if (rrData?.intervals && rrData.intervals.length >= 3) {
      const lastThreeIntervals = rrData.intervals.slice(-3);
      const avgRR = lastThreeIntervals.reduce((a, b) => a + b, 0) / lastThreeIntervals.length;
      
      let rmssd = 0;
      for (let i = 1; i < lastThreeIntervals.length; i++) {
        rmssd += Math.pow(lastThreeIntervals[i] - lastThreeIntervals[i-1], 2);
      }
      rmssd = Math.sqrt(rmssd / (lastThreeIntervals.length - 1));
      
      const lastRR = lastThreeIntervals[lastThreeIntervals.length - 1];
      const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
      
      if (rmssd > 50 && 
          rrVariation > 0.20 && 
          currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
          arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION) {
        
        setArrhythmiaCounter(prev => prev + 1);
        lastArrhythmiaTime.current = currentTime;
        
        console.log("Nueva arritmia detectada:", {
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
    
    // Si no hay nuevas arritmias, mantener el contador actual
    return {
      spo2: result.spo2,
      pressure: result.pressure,
      arrhythmiaStatus: arrhythmiaCounter > 0 ? 
        `ARRITMIA DETECTADA|${arrhythmiaCounter}` : 
        `SIN ARRITMIAS|${arrhythmiaCounter}`,
      lastArrhythmiaData: null
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
