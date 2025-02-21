
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime, isComplete } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();

  const handleStartStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isMonitoring && !isCameraOn) {
      setIsCameraOn(true);
      startProcessing();
      setTimeout(() => setIsMonitoring(true), 500);
    } else if (isMonitoring) {
      setIsMonitoring(false);
      stopProcessing();
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMonitoring(false);
    stopProcessing();
    setSignalQuality(0);
    setIsCameraOn(false);
  };

  const handleStreamReady = (stream: MediaStream) => {
    console.log("Camera stream ready", stream);
  };

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        {/* Cámara en segundo plano */}
        <div className="absolute inset-0">
          <CameraView onStreamReady={handleStreamReady} isMonitoring={isCameraOn} />
        </div>

        {/* Contenido principal */}
        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          {/* Contenedor superior */}
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="text-base font-mono text-medical-blue bg-black/30 px-3 py-1 rounded">
              {isMonitoring ? `${Math.ceil(22 - elapsedTime)}s` : '22s'}
            </div>
          </div>

          {/* Contenedor central */}
          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            {/* Monitor cardíaco */}
            <div className="bg-black/40 rounded p-1">
              <canvas 
                ref={canvasRef} 
                width={400} 
                height={80} 
                className="w-full h-16 rounded"
              />
            </div>

            {/* Indicador de calidad */}
            <SignalQualityIndicator quality={signalQuality} />

            {/* Grid de signos vitales */}
            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} unit="events" />
            </div>
          </div>

          {/* Contenedor inferior */}
          <div className="flex justify-center gap-2 w-full max-w-md mx-auto">
            <Button
              onClick={async (e) => {
                e.preventDefault();
                const processor = await import('../modules/SignalProcessor');
                const signalProcessor = new processor.PPGSignalProcessor();
                await signalProcessor.calibrate();
              }}
              size="sm"
              className="flex-1 bg-medical-blue/80 hover:bg-medical-blue text-white text-xs py-1.5"
            >
              Calibrar
            </Button>
            
            <Button
              onClick={handleStartStop}
              size="sm"
              className={`flex-1 ${isMonitoring ? 'bg-medical-red/80' : 'bg-medical-blue/80'} hover:opacity-100 text-white text-xs py-1.5`}
              disabled={isComplete && !isMonitoring}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              onClick={handleReset}
              size="sm"
              className="flex-1 bg-gray-600/80 hover:bg-gray-600 text-white text-xs py-1.5"
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
