
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

  useEffect(() => {
    if (!isMeasuring) {
      setMeasurements({
        heartRate: 0,
        spo2: 0,
        pressure: "--/--",
        arrhythmiaCount: 0
      });
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();
    const MEASUREMENT_DURATION = 30000; // Aumentado a 30 segundos

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      setElapsedTime(elapsed / 1000);

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
    elapsedTime: Math.min(elapsedTime, 30), // Ajustado a 30 segundos
    isComplete: elapsedTime >= 30 // Ajustado a 30 segundos
  };
};
