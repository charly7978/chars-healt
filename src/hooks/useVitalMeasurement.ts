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

  useEffect(() => {
    if (!isMeasuring) return;

    let prevSignal = 75;
    const interval = setInterval(() => {
      // Simulate vital measurements following the original logic
      const signal = Math.min(
        Math.max(
          prevSignal + Math.floor(Math.random() * 5) + 1,
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
        heartRate: signal,
        spo2: Number(spo2Value.toFixed(1)),
        pressure: `${Math.round(systolic)}/${Math.round(diastolic)}`,
        arrhythmiaCount: Math.abs(signal - 75) > 15 ? 1 : 0,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMeasuring]);

  return measurements;
};