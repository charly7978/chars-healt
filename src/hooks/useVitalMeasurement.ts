
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
        arrhythmiaCount: "--"
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

      console.log('useVitalMeasurement - Actualización:', {
        processor: !!processor,
        bpm,
        timestamp: new Date().toISOString()
      });

      setMeasurements(prev => {
        if (prev.heartRate === bpm) {
          return prev;
        }

        return {
          ...prev,
          heartRate: bpm
        };
      });
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
