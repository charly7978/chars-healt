
import { useState, useEffect } from 'react';

interface VitalMeasurements {
  heartRate: number;
  spo2: number;
  pressure: string;
  arrhythmiaCount: string | number;
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
    console.log('useVitalMeasurement - Estado:', {
      isMeasuring,
      currentMeasurements: measurements,
      elapsedTime,
      timestamp: new Date().toISOString()
    });

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
      if (!processor) {
        console.warn('VitalMeasurement: No se encontró el procesador');
        return;
      }

      const bpm = processor.getFinalBPM() || 0;
      const arrCount = processor.arrhythmiaCount || 0;

      console.log('useVitalMeasurement - Actualización:', {
        processor: !!processor,
        bpm,
        arrCount,
        timestamp: new Date().toISOString()
      });

      setMeasurements(prev => {
        const arrhythmiaStatus = 
          arrCount > 0 ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS";

        if (prev.heartRate === bpm && prev.arrhythmiaCount === arrhythmiaStatus) {
          return prev;
        }

        console.log('useVitalMeasurement - Nuevos valores:', {
          bpm,
          arrhythmiaStatus,
          timestamp: new Date().toISOString()
        });

        return {
          ...prev,
          heartRate: bpm,
          arrhythmiaCount: isMeasuring ? arrhythmiaStatus : arrCount
        };
      });

      setLastArrhythmiaCount(arrCount);
    };

    updateMeasurements();

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      setElapsedTime(elapsed / 1000);

      updateMeasurements();

      if (elapsed >= MEASUREMENT_DURATION) {
        clearInterval(interval);
        const event = new CustomEvent('measurementComplete');
        window.dispatchEvent(event);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isMeasuring]);

  return {
    ...measurements,
    elapsedTime: Math.min(elapsedTime, 30),
    isComplete: elapsedTime >= 30
  };
};
