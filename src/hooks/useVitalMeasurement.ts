
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
      if (!processor) {
        console.warn('VitalMeasurement: No se encontró el procesador');
        return;
      }

      // Usamos solo getFinalBPM que es público
      const bpm = processor.getFinalBPM() || 0;
      const arrCount = processor.arrhythmiaCount || 0;

      // Log detallado para debug
      console.log('VitalMeasurement: Valores actuales:', {
        processor: !!processor,
        bpm,
        arrCount,
        timestamp: new Date().toISOString()
      });

      // Actualizar estado solo si los valores son diferentes
      setMeasurements(prev => {
        if (prev.heartRate === bpm && prev.arrhythmiaCount === arrCount) {
          return prev; // No actualizar si no hay cambios
        }
        return {
          ...prev,
          heartRate: bpm,
          arrhythmiaCount: arrCount
        };
      });

      setLastArrhythmiaCount(arrCount);
    };

    // Actualizar inmediatamente
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
    }, 200); // Actualizamos más frecuentemente para no perder valores

    return () => clearInterval(interval);
  }, [isMeasuring]);

  return {
    ...measurements,
    elapsedTime: Math.min(elapsedTime, 30),
    isComplete: elapsedTime >= 30
  };
};
