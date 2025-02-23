
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PPGResultDialog from "@/components/PPGResultDialog";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import CalibrationDialog from "@/components/CalibrationDialog";
import { Play, Square } from "lucide-react";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [resultData, setResultData] = useState<Array<{time: number, value: number, isPeak: boolean}>>([]);
  const measurementTimerRef = useRef<number | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const handleCalibrationClick = () => {
    if (isMonitoring) {
      setShowCalibrationDialog(true);
    }
  };

  const handleCalibrationStart = async () => {
    console.log("Iniciando calibración...");
    // Aquí iría la lógica de calibración real
  };

  const handleCalibrationEnd = () => {
    console.log("Calibración finalizada");
    setShowCalibrationDialog(false);
  };

  const startMonitoring = () => {
    console.log("Iniciando monitoreo...");
    setIsMonitoring(true);
    setIsCameraOn(true);
    setIsPaused(false);
    startProcessing();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
    }
    
    measurementTimerRef.current = window.setInterval(() => {
      setElapsedTime(prev => {
        if (prev >= 30) {
          stopMonitoring();
          return 30;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopMonitoring = () => {
    console.log("Deteniendo monitoreo...");
    setIsMonitoring(false);
    setIsCameraOn(false);
    setIsPaused(false);
    stopProcessing();
    resetVitalSigns();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    console.log("Stream de cámara listo", stream.getVideoTracks()[0].getSettings());
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    // Activar linterna si está disponible
    if (videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(err => console.error("Error activando linterna:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("No se pudo obtener el contexto 2D del canvas temporal");
      return;
    }
    
    const processImage = async () => {
      if (!isMonitoring) {
        console.log("Monitoreo detenido, no se procesan más frames");
        return;
      }
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        
        // Procesar frame y actualizar señal
        processFrame(imageData);
        
        if (isMonitoring) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Error capturando frame:", error);
        if (isMonitoring) {
          requestAnimationFrame(processImage);
        }
      }
    };

    processImage();
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      console.log("Procesando señal:", lastSignal);
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus);
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  const handlePPGDataReady = (data: Array<{time: number, value: number, isPeak: boolean}>) => {
    setResultData(data);
    setShowResults(true);
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
            buttonPosition={document.querySelector('.measure-button')?.getBoundingClientRect()}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full mt-[-12rem]">
            <div className="relative">
              <PPGSignalMeter 
                value={lastSignal?.filteredValue || 0}
                quality={lastSignal?.quality || 0}
                isFingerDetected={lastSignal?.fingerDetected || false}
                isComplete={elapsedTime >= 30}
                onDataReady={handlePPGDataReady}
              />
            </div>

            <SignalQualityIndicator 
              quality={signalQuality} 
              isMonitoring={isMonitoring}
            />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={vitalSigns.spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={vitalSigns.pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 w-full max-w-md mx-auto mt-[-8rem]">
            {isMonitoring && (
              <div className="text-xs font-medium text-gray-300 mb-1">
                Tiempo: {elapsedTime}s / 30s
              </div>
            )}
            <Button
              onClick={isMonitoring ? stopMonitoring : startMonitoring}
              className={`w-full measure-button ${
                isMonitoring 
                  ? 'bg-red-600/80 hover:bg-red-600' 
                  : 'bg-green-600/80 hover:bg-green-600'
              } text-white`}
            >
              {isMonitoring ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Detener Medición
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Medición
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <PPGResultDialog
        isOpen={showResults}
        onClose={() => setShowResults(false)}
        signalData={resultData}
      />

      <CalibrationDialog
        isOpen={showCalibrationDialog}
        onClose={() => setShowCalibrationDialog(false)}
        onCalibrationStart={handleCalibrationStart}
        onCalibrationEnd={handleCalibrationEnd}
      />
    </div>
  );
};

export default Index;
