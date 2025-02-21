import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import HeartShape from "@/components/HeartShape";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime } = useVitalMeasurement(isMonitoring);

  const handleStartStop = () => {
    console.log('BOTÓN: Click en Start/Stop');
    console.log('ESTADO ACTUAL:', { isMonitoring, isCameraOn });
    
    if (!isMonitoring && !isCameraOn) {
      console.log('ACCIÓN: Iniciando monitoreo...');
      setIsCameraOn(true);
      setTimeout(() => {
        console.log('ACCIÓN: Activando isMonitoring después del delay');
        setIsMonitoring(true);
      }, 500);
    } else if (isMonitoring) {
      console.log('ACCIÓN: Deteniendo monitoreo...');
      setIsMonitoring(false);
    }
  };

  const handleReset = () => {
    console.log('BOTÓN: Click en Reset');
    setIsMonitoring(false);
    setSignalQuality(0);
    setIsCameraOn(false);
    console.log('ESTADO RESETEADO');
  };

  const handleStreamReady = (stream: MediaStream) => {
    console.log('STREAM: Cámara lista y conectada');
    console.log('STREAM INFO:', {
      active: stream.active,
      id: stream.id,
      tracks: stream.getTracks().length
    });
  };

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView onStreamReady={handleStreamReady} isMonitoring={isCameraOn} />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="text-base font-mono text-medical-blue bg-black/30 px-3 py-1 rounded">
              {isMonitoring ? elapsedTime + 's' : '0s'}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <div className="bg-black/40 rounded p-1">
              {/* Panel de monitoreo */}
            </div>

            <SignalQualityIndicator quality={signalQuality} />

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
