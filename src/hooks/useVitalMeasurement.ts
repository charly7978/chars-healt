
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
    const MEASUREMENT_DURATION = 22000; // 22 segundos en milisegundos

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      setElapsedTime(elapsed / 1000);

      // Si han pasado 22 segundos, detener la medición
      if (elapsed >= MEASUREMENT_DURATION) {
        clearInterval(interval);
        // Disparar un evento personalizado para notificar que la medición ha terminado
        const event = new CustomEvent('measurementComplete');
        window.dispatchEvent(event);
        return;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMeasuring]);

  return {
    ...measurements,
    elapsedTime: Math.min(elapsedTime, 22),
    isComplete: elapsedTime >= 22
  };
};
