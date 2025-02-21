
import { useState, useRef, useEffect } from "react";
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
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime, isComplete } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();

  useEffect(() => {
    const handleMeasurementComplete = (e: Event) => {
      e.preventDefault();
      setIsMonitoring(false);
    };

    window.addEventListener('measurementComplete', handleMeasurementComplete);
    return () => window.removeEventListener('measurementComplete', handleMeasurementComplete);
  }, []);

  useEffect(() => {
    if (lastSignal) {
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal]);

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

  useEffect(() => {
    if (canvasRef.current && isMonitoring) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      let x = 0;
      const animate = () => {
        if (!isMonitoring) return;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        
        const signalValue = lastSignal ? lastSignal.filteredValue : 0;
        
        ctx.beginPath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.moveTo(x - 1, canvasRef.current!.height / 2);
        ctx.lineTo(x, canvasRef.current!.height / 2 + signalValue);
        ctx.stroke();
        
        x = (x + 1) % canvasRef.current!.width;
        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [isMonitoring, lastSignal]);

  const handleStreamReady = (stream: MediaStream) => {
    console.log("Camera stream ready", stream);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-2">
      <div className="relative w-full max-w-sm bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        {/* Cámara en segundo plano */}
        <div className="absolute inset-0 opacity-30">
          <CameraView onStreamReady={handleStreamReady} isMonitoring={isCameraOn} />
        </div>

        {/* Contenido principal */}
        <div className="relative z-10 p-2 space-y-2">
          {/* Cabecera y tiempo */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-lg font-bold text-white">PPG Monitor</h1>
            <div className="text-base font-mono text-medical-blue bg-black/20 px-2 py-1 rounded">
              {isMonitoring ? `${Math.ceil(22 - elapsedTime)}s` : '22s'}
            </div>
          </div>

          {/* Monitor cardíaco */}
          <div className="bg-black/40 rounded p-1 mb-1">
            <canvas 
              ref={canvasRef} 
              width={400} 
              height={80} 
              className="w-full h-16 rounded"
            />
          </div>

          {/* Indicador de calidad y mediciones en grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <SignalQualityIndicator quality={signalQuality} />
            </div>
            <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
            <VitalSign label="SpO2" value={spo2} unit="%" />
            <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
            <VitalSign label="Arrhythmias" value={arrhythmiaCount} unit="events" />
          </div>

          {/* Botones de control */}
          <div className="flex justify-between gap-2 pt-1">
            <Button
              onClick={async (e) => {
                e.preventDefault();
                const processor = await import('../modules/SignalProcessor');
                const signalProcessor = new processor.PPGSignalProcessor();
                await signalProcessor.calibrate();
              }}
              size="sm"
              className="flex-1 bg-medical-blue hover:bg-medical-blue/80 text-white text-xs py-1"
            >
              Calibrar
            </Button>
            
            <Button
              onClick={handleStartStop}
              size="sm"
              className={`flex-1 ${isMonitoring ? 'bg-medical-red' : 'bg-medical-blue'} hover:opacity-80 text-white text-xs py-1`}
              disabled={isComplete && !isMonitoring}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              onClick={handleReset}
              size="sm"
              className="flex-1 bg-gray-600 hover:bg-gray-600/80 text-white text-xs py-1"
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
