
import { useState, useEffect } from 'react';

interface VitalMeasurements {
  heartRate: number;
  spo2: number;
  pressure: string;
  arrhythmiaCount: number;
}

export const useVitalMeasurement = (isMeasuring: boolean) => {
  const [measurements, setMeasurements] = useState<VitalMeasurements>({
    heartRate: 0,
    spo2: 0,
    pressure: "--/--",
    arrhythmiaCount: 0
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastArrhythmiaCount, setLastArrhythmiaCount] = useState(0);

  useEffect(() => {
    if (!isMeasuring) {
      setMeasurements(prev => ({
        ...prev,
        heartRate: 0,
        spo2: 0,
        pressure: "--/--",
        arrhythmiaCount: lastArrhythmiaCount
      }));
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();
    const MEASUREMENT_DURATION = 30000;

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      setElapsedTime(elapsed / 1000);

      // Verificamos y actualizamos el conteo de arritmias y BPM
      const processor = window.heartBeatProcessor;
      if (processor) {
        const currentCount = processor.arrhythmiaCount;
        
        // Obtenemos los valores actuales
        let currentBPM = 0;
        const sorted = [...processor.bpmHistory].sort((a, b) => a - b);
        if (sorted.length > 2) {
          // Promedio de los últimos valores, excluyendo outliers
          const validBPMs = sorted.slice(1, -1);
          currentBPM = Math.round(validBPMs.reduce((a, b) => a + b, 0) / validBPMs.length);
        }
        
        console.log('Updating vitals:', { currentBPM, currentCount });
        
        setLastArrhythmiaCount(currentCount);
        setMeasurements(prev => ({
          ...prev,
          heartRate: currentBPM,
          arrhythmiaCount: currentCount
        }));
      }

      if (elapsed >= MEASUREMENT_DURATION) {
        clearInterval(interval);
        const event = new CustomEvent('measurementComplete');
        window.dispatchEvent(event);
        return;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMeasuring]);

  return {
    ...measurements,
    elapsedTime: Math.min(elapsedTime, 30),
    isComplete: elapsedTime >= 30
  };
};
