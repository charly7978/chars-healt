
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

    const updateMeasurements = () => {
      const processor = window.heartBeatProcessor;
      if (processor) {
        // Obtenemos los valores directamente del procesador
        const currentBPM = processor.getFinalBPM();
        const currentCount = processor.arrhythmiaCount;
        
        console.log('VitalMeasurement: Actualizando medidas:', { 
          bpm: currentBPM, 
          arritmias: currentCount,
          timestamp: new Date().toISOString()
        });
        
        setLastArrhythmiaCount(currentCount);
        setMeasurements(prev => ({
          ...prev,
          heartRate: currentBPM || 0,
          arrhythmiaCount: currentCount
        }));
      }
    };

    // Actualizamos inmediatamente la primera vez
    updateMeasurements();

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      setElapsedTime(elapsed / 1000);

      // Actualizamos medidas en cada intervalo
      updateMeasurements();

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
