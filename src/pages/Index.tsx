
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import HeartShape from "@/components/HeartShape";
import VitalSign from "@/components/VitalSign";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import CameraView from "@/components/CameraView";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && isMonitoring) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      let x = 0;
      const animate = () => {
        if (!isMonitoring) return;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        
        ctx.beginPath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.moveTo(x - 1, canvasRef.current!.height / 2);
        ctx.lineTo(x, canvasRef.current!.height / 2 + Math.sin(x * 0.1) * 50);
        ctx.stroke();
        
        x = (x + 1) % canvasRef.current!.width;
        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [isMonitoring]);

  const handleStreamReady = (stream: MediaStream) => {
    console.log("Camera stream ready", stream);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <CameraView onStreamReady={handleStreamReady} isMonitoring={isMonitoring} />

      <div className="relative z-10 h-screen bg-black/40 backdrop-blur-sm text-white p-4">
        <div className="h-full flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-bold text-center mb-2 text-white/90">PPG Monitor</h1>

            {/* Indicador de calidad de señal */}
            <div className="bg-gray-800/50 backdrop-blur-md p-2 rounded-lg mb-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{
                    backgroundColor: signalQuality > 75 ? '#00ff00' : 
                                   signalQuality > 50 ? '#ffff00' : '#ff0000'
                  }}
                />
                <span className="text-sm">Signal Quality: {signalQuality}%</span>
              </div>
            </div>

            {/* Monitor cardíaco */}
            <div className="bg-gray-800/50 backdrop-blur-md p-2 rounded-lg mb-2">
              <canvas 
                ref={canvasRef} 
                width={800} 
                height={100} 
                className="w-full h-24 bg-black/50 rounded"
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
              onClick={() => setSignalQuality(Math.min(signalQuality + 10, 100))}
              variant="outline"
              className="bg-gray-700/70 hover:bg-gray-700/90 text-white backdrop-blur-sm text-sm px-3 py-1"
            >
              Calibrar
            </Button>
            
            <Button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`${isMonitoring ? 'bg-medical-red/90' : 'bg-medical-blue/90'} hover:bg-opacity-100 text-white backdrop-blur-sm text-sm px-3 py-1`}
            >
              {isMonitoring ? 'Detener' : 'Iniciar'}
            </Button>

            <Button
              onClick={() => {
                setIsMonitoring(false);
                setSignalQuality(0);
              }}
              variant="outline"
              className="bg-gray-700/70 hover:bg-gray-700/90 text-white backdrop-blur-sm text-sm px-3 py-1"
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
