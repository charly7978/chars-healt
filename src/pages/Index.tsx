import { useState } from "react";
import { Button } from "@/components/ui/button";
import HeartShape from "@/components/HeartShape";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const { heartRate, spo2, pressure, arrhythmiaCount } = useVitalMeasurement(isMonitoring);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-12">Health Monitor</h1>
        
        <div className="flex flex-col items-center mb-12">
          <HeartShape isBeating={isMonitoring} className="mb-8" />
          <Button
            onClick={() => setIsMonitoring(!isMonitoring)}
            className="bg-medical-blue hover:bg-medical-blue/90 text-white"
          >
            {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
          <VitalSign label="SpO2" value={spo2} unit="%" />
          <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
          <VitalSign
            label="Arrhythmias Detected"
            value={arrhythmiaCount}
            unit="events"
          />
        </div>
      </div>
    </div>
  );
};

export default Index;