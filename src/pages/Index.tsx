
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import HeartShape from "@/components/HeartShape";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime, isComplete } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();

  // Manejo de la finalización de la medición
  useEffect(() => {
    const handleMeasurementComplete = (e: Event) => {
      e.preventDefault();
      setIsMonitoring(false);
    };

    window.addEventListener('measurementComplete', handleMeasurementComplete);
    return () => window.removeEventListener('measurementComplete', handleMeasurementComplete);
  }, []);

  // Actualización de la calidad de señal cuando recibimos nueva información
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
        
        // Usar la señal procesada para la animación si está disponible
        const signalValue = lastSignal ? lastSignal.filteredValue : Math.sin(x * 0.1) * 50;
        
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
    <div className="relative h-screen w-full overflow-hidden">
      <CameraView onStreamReady={handleStreamReady} isMonitoring={isCameraOn} />

      <div className="relative z-10 h-screen bg-black/10 backdrop-blur-sm text-white p-4">
        <div className="h-full flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-bold text-center mb-2 text-white/90">PPG Monitor</h1>

            {/* Tiempo restante */}
            <div className="bg-gray-800/20 backdrop-blur-md p-2 rounded-lg mb-2">
              <div className="flex items-center justify-center">
                <span className="text-lg font-bold text-white/90">
                  {isMonitoring ? `${Math.ceil(22 - elapsedTime)}s` : '22s'}
                </span>
              </div>
            </div>

            {/* Indicador de calidad de señal */}
            <div className="bg-gray-800/20 backdrop-blur-md p-2 rounded-lg mb-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{
                    backgroundColor: signalQuality > 75 ? '#00ff00' : 
                                   signalQuality > 50 ? '#ffff00' : '#ff0000'
                  }}
                />
                <span className="text-sm text-white/90">Signal Quality: {signalQuality}%</span>
              </div>
            </div>

            {/* Monitor cardíaco */}
            <div className="bg-gray-800/20 backdrop-blur-md p-2 rounded-lg mb-2">
              <canvas 
                ref={canvasRef} 
                width={800} 
                height={100} 
                className="w-full h-24 bg-black/20 rounded"
              />
            </div>

            {/* Mediciones principales */}
            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} unit="events" />
            </div>
          </div>

          {/* Controles */}
          <div className="flex justify-center gap-2 pb-4">
            <Button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                const processor = await import('../modules/SignalProcessor');
                const signalProcessor = new processor.PPGSignalProcessor();
                await signalProcessor.calibrate();
              }}
              variant="outline"
              className="bg-gray-700/30 hover:bg-gray-700/50 text-white backdrop-blur-sm text-sm px-3 py-1"
            >
              Calibrar
            </Button>
            
            <Button
              type="button"
              onClick={handleStartStop}
              className={`${isMonitoring ? 'bg-medical-red/50' : 'bg-medical-blue/50'} hover:bg-opacity-70 text-white backdrop-blur-sm text-sm px-3 py-1`}
              disabled={isComplete && !isMonitoring}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              type="button"
              onClick={handleReset}
              variant="outline"
              className="bg-gray-700/30 hover:bg-gray-700/50 text-white backdrop-blur-sm text-sm px-3 py-1"
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
