import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const processingRef = useRef<boolean>(false);
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  useEffect(() => {
    processingRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    if (!isMonitoring) {
      setElapsedTime(0);
      setArrhythmiaCount("--");
      setVitalSigns(prev => ({ ...prev, arrhythmiaStatus: "--" }));
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = (currentTime - startTime) / 1000;
      setElapsedTime(elapsed);

      if (elapsed >= 30) {
        const event = new CustomEvent('measurementComplete');
        window.dispatchEvent(event);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  useEffect(() => {
    if (lastSignal) {
      console.log("Index: Actualizando calidad de señal:", lastSignal.quality);
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal]);

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected) {
      console.log("Index: Procesando señal cardíaca y vital", {
        value: lastSignal.filteredValue,
        fingerDetected: lastSignal.fingerDetected,
        quality: lastSignal.quality
      });
      
      // Procesar señal cardíaca
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      // Procesar signos vitales (SpO2, presión y arritmias)
      const vitals = processVitalSigns(lastSignal.filteredValue);
      if (vitals) {
        setVitalSigns(vitals);
        // Actualizar el estado de arritmias y registrar logs
        setArrhythmiaCount(vitals.arrhythmiaStatus);

        console.log("Index: Actualización de signos vitales", {
          timestamp: new Date().toISOString(),
          heartRate: heartBeatResult.bpm,
          spo2: vitals.spo2,
          bloodPressure: vitals.pressure,
          arrhythmiaStatus: vitals.arrhythmiaStatus,
          signalQuality: lastSignal.quality
        });
      }
    }
  }, [lastSignal, processHeartBeat, processVitalSigns]);

  useEffect(() => {
    const handleMeasurementComplete = (e: Event) => {
      e.preventDefault();
      handleStopMeasurement();
    };

    window.addEventListener('measurementComplete', handleMeasurementComplete);
    return () => window.removeEventListener('measurementComplete', handleMeasurementComplete);
  }, []);

  const handleStreamReady = (stream: MediaStream) => {
    console.log("Index: Camera stream ready", stream.getVideoTracks()[0].getSettings());
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
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Index: Error capturando frame:", error);
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      }
    };

    console.log("Index: Iniciando monitoreo de signos vitales");
    setIsMonitoring(true);
    processingRef.current = true;
    processImage();
  };

  const handleStartMeasurement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("Index: Iniciando nueva medición");
    startProcessing();
    setIsCameraOn(true);
  };

  const handleStopMeasurement = () => {
    console.log("Index: Deteniendo medición", {
      finalMeasurements: {
        heartRate,
        spo2: vitalSigns.spo2,
        bloodPressure: vitalSigns.pressure,
        arrhythmiaStatus: vitalSigns.arrhythmiaStatus
      }
    });
    
    setIsMonitoring(false);
    processingRef.current = false;
    stopProcessing();
    setSignalQuality(0);
    setIsCameraOn(false);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleStopMeasurement();
    resetVitalSigns();
    setVitalSigns({ spo2: 0, pressure: "--/--", arrhythmiaStatus: "--" });
    setHeartRate(0);
    setArrhythmiaCount("--");
    console.log("Index: Medición reiniciada, valores reseteados");
  };

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
              {isMonitoring ? `${Math.ceil(30 - elapsedTime)}s` : '30s'}
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <PPGSignalMeter 
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
            />

            <SignalQualityIndicator quality={signalQuality} />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={vitalSigns.spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={vitalSigns.pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} />
            </div>
          </div>

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
              onClick={isMonitoring ? handleStopMeasurement : handleStartMeasurement}
              size="sm"
              className={`flex-1 ${isMonitoring ? 'bg-medical-red/80 hover:bg-medical-red' : 'bg-medical-blue/80 hover:bg-medical-blue'} text-white text-xs py-1.5`}
              disabled={elapsedTime >= 30 && !isMonitoring}
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
