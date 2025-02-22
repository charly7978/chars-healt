import { useState, useRef, useEffect } from "react";
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
  const [currentBPM, setCurrentBPM] = useState(0);
  const [measurementConfidence, setMeasurementConfidence] = useState(0);
  const { heartRate, spo2, pressure, arrhythmiaCount, elapsedTime, isComplete } = useVitalMeasurement(isMonitoring);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const processingRef = useRef<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    processingRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    if (lastSignal) {
      console.log("Index: Actualizando datos vitales:", {
        quality: lastSignal.quality,
        heartRate: lastSignal.heartRate,
        confidence: lastSignal.confidence
      });
      setSignalQuality(lastSignal.quality);
      if (lastSignal.fingerDetected && lastSignal.heartRate > 0) {
        setCurrentBPM(lastSignal.heartRate);
        setMeasurementConfidence(lastSignal.confidence);
      }
    }
  }, [lastSignal]);

  const handleStreamReady = (stream: MediaStream) => {
    console.log("Index: Camera stream ready", stream.getVideoTracks()[0].getSettings());
    streamRef.current = stream;
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    if (videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(err => console.error("Error activando linterna:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("Index: No se pudo obtener el contexto 2D del canvas temporal");
      return;
    }
    
    const processImage = async () => {
      if (!processingRef.current) {
        console.log("Index: Monitoreo detenido, no se procesan más frames");
        return;
      }
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        processFrame(imageData);
        
        if (processingRef.current) {
          animationFrameRef.current = requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Index: Error capturando frame:", error);
        if (processingRef.current) {
          animationFrameRef.current = requestAnimationFrame(processImage);
        }
      }
    };

    setIsMonitoring(true);
    processingRef.current = true;
    startProcessing();
    processImage();
  };

  const handleStartMeasurement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Index: Iniciando medición");
    setIsCameraOn(true);
  };

  const cleanupResources = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => {
        if (track.getCapabilities()?.torch) {
          track.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
        track.stop();
      });
      streamRef.current = null;
    }
  };

  const handleStopMeasurement = () => {
    console.log("Index: Deteniendo medición");
    setIsMonitoring(false);
    processingRef.current = false;
    stopProcessing();
    setIsCameraOn(false);
    cleanupResources();
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleStopMeasurement();
  };

  const handleCalibrate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Index: Calibrando...");
  };

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    let previousY = canvasRef.current?.height ? canvasRef.current.height / 2 : 0;
    let x = 0;

    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas || !isMonitoring) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const signalValue = lastSignal ? -lastSignal.filteredValue * 100 : 0;
      const currentY = (canvas.height / 2) + signalValue;
      
      const gradient = ctx.createLinearGradient(x-1, previousY, x, currentY);
      gradient.addColorStop(0, '#00ff00');
      gradient.addColorStop(1, '#39FF14');
      
      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.moveTo(x-1, previousY);
      ctx.lineTo(x, currentY);
      ctx.stroke();
      
      previousY = currentY;
      x = (x + 1) % canvas.width;
      
      animationFrameId = requestAnimationFrame(animate);
    };

    if (isMonitoring && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        animate();
      }
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isMonitoring, lastSignal]);

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady} 
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="text-base font-mono text-medical-blue bg-black/30 px-3 py-1 rounded">
              {isMonitoring ? `${Math.ceil(22 - elapsedTime)}s` : '22s'}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <div className="bg-black/40 backdrop-blur-sm rounded-lg p-2">
              <canvas 
                ref={canvasRef} 
                width={400} 
                height={100}
                className="w-full h-20 rounded bg-black/60"
              />
            </div>

            <SignalQualityIndicator quality={signalQuality} />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign 
                label="Heart Rate" 
                value={currentBPM > 0 ? currentBPM : '--'} 
                unit="BPM" 
              />
              <VitalSign 
                label="Confidence" 
                value={measurementConfidence > 0 ? Math.round(measurementConfidence * 100) : '--'} 
                unit="%" 
              />
            </div>
          </div>

          <div className="flex justify-center gap-2 w-full max-w-md mx-auto">
            <Button
              onClick={handleCalibrate}
              size="sm"
              className="flex-1 bg-medical-blue/80 hover:bg-medical-blue text-white text-xs py-1.5"
            >
              Calibrar
            </Button>
            
            <Button
              onClick={isMonitoring ? handleStopMeasurement : handleStartMeasurement}
              size="sm"
              className={`flex-1 ${isMonitoring ? 'bg-medical-red/80 hover:bg-medical-red' : 'bg-medical-blue/80 hover:bg-medical-blue'} text-white text-xs py-1.5`}
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
