import { useState, useEffect } from "react";

interface VitalSigns {
  heartRate: number;
  spo2: number;
  bloodPressure: string;
  arrhythmias: number;
}

export const useVitalSigns = (isMonitoring: boolean) => {
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({
    heartRate: 0,
    spo2: 0,
    bloodPressure: "--/--",
    arrhythmias: 0,
  });

  useEffect(() => {
    if (!isMonitoring) {
      return;
    }

    let prevSignal = 75;
    const interval = setInterval(() => {
      const signal = Math.min(
        Math.max(prevSignal + Math.floor(Math.random() * 11) - 5, 60),
        100
      );
      prevSignal = signal;

      const spo2Value = Math.min(
        Math.max(98.5 - (Math.abs(signal - 75) / 50.0) * 3.5, 95),
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
        Math.max(80 + Math.pow(Math.abs(signal - 75), 0.35) * 6, 70),
        100
      );

      setVitalSigns({
        heartRate: signal,
        spo2: Number(spo2Value.toFixed(1)),
        bloodPressure: `${Math.round(systolic)}/${Math.round(diastolic)}`,
        arrhythmias: Math.abs(signal - 75) > 15 ? 1 : 0,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  return vitalSigns;
};