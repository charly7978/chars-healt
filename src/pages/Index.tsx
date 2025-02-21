
import { useState } from "react";
import { Button } from "@/components/ui/button";
import HeartShape from "@/components/HeartShape";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import CameraView from "@/components/CameraView";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime } = useVitalMeasurement(isMonitoring);

  const handleStartStop = () => {
    console.log('BOTÓN:', isMonitoring ? 'DETENIENDO' : 'INICIANDO');
    setIsMonitoring(!isMonitoring);
  };

  const handleReset = () => {
    console.log('BOTÓN: RESET');
    setIsMonitoring(false);
  };

  const handleStreamReady = (stream: MediaStream) => {
    console.log('CÁMARA CONECTADA');
  };

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView onStreamReady={handleStreamReady} isMonitoring={isMonitoring} />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="text-base font-mono text-medical-blue bg-black/30 px-3 py-1 rounded">
              {isMonitoring ? elapsedTime + 's' : '0s'}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <SignalQualityIndicator quality={0} />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} unit="events" />
            </div>
          </div>

          <div className="flex justify-center gap-2 w-full max-w-md mx-auto">
            <Button
              onClick={handleStartStop}
              className={`flex-1 ${isMonitoring ? 'bg-medical-red/80' : 'bg-medical-blue/80'} hover:opacity-100 text-white`}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              onClick={handleReset}
              className="flex-1 bg-gray-600/80 hover:bg-gray-600 text-white"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
