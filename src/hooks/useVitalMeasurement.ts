
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

    let prevSignal = 75;
    let startTime = Date.now();
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

      // Simulación más realista de señales PPG
      const signal = Math.min(
        Math.max(
          prevSignal + (Math.random() - 0.5) * 10,
          60
        ),
        100
      );
      prevSignal = signal;

      const spo2Value = Math.min(
        Math.max(
          98.5 - (Math.abs(signal - 75) / 50.0 * 3.5),
          95
        ),
        99
      );

      const systolic = Math.min(
        Math.max(
          120 + Math.pow(Math.abs(signal - 75), 0.35) * 12,
          110
        ),
        140
      );
      const diastolic = Math.min(
        Math.max(
          80 + Math.pow(Math.abs(signal - 75), 0.35) * 6,
          70
        ),
        100
      );

      setMeasurements({
        heartRate: Math.round(signal),
        spo2: Number(spo2Value.toFixed(1)),
        pressure: `${Math.round(systolic)}/${Math.round(diastolic)}`,
        arrhythmiaCount: Math.abs(signal - 75) > 15 ? 1 : 0,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMeasuring]);

  return {
    ...measurements,
    elapsedTime: Math.min(elapsedTime, 22), // Asegurarse de que no exceda los 22 segundos
    isComplete: elapsedTime >= 22
  };
};
