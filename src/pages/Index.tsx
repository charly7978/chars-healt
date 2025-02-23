
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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [resultData, setResultData] = useState<Array<{time: number, value: number, isPeak: boolean}>>([]);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [rrData, setRRData] = useState<{ intervals: number[]; lastPeakTime: number | null } | null>(null);
  const [currentBPM, setCurrentBPM] = useState(0);

  const {
    isProcessing,
    lastSignal,
    startProcessing,
    stopProcessing,
    calibrate,
    processFrame
  } = useSignalProcessor();
  const heartBeatProcessor = useHeartBeatProcessor();
  const vitalSignsProcessor = useVitalSignsProcessor();

  const [arrhythmiaStatus, setArrhythmiaStatus] = useState<string>("SIN ARRITMIAS|0");

  useEffect(() => {
    if (lastSignal && rrData) {
      const result = vitalSignsProcessor.processSignal(
        lastSignal.filteredValue,
        rrData
      );
      setArrhythmiaStatus(result.arrhythmiaStatus);
    }
  }, [lastSignal, rrData, vitalSignsProcessor]);

  useEffect(() => {
    const bpm = heartBeatProcessor.getFinalBPM();
    if (bpm > 0) {
      setCurrentBPM(bpm);
    }
  }, [heartBeatProcessor]);

  const startCapture = async () => {
    if (!isCameraActive) {
      alert("Por favor, activa la cámara primero.");
      return;
    }

    if (isProcessing) {
      stopProcessing();
    }

    heartBeatProcessor.reset();
    vitalSignsProcessor.reset();
    setCurrentBPM(0);

    startProcessing();
    setResultData([]);
  };

  const stopCapture = () => {
    stopProcessing();
    setShowResults(true);
  };

  const onFrameProcessed = (imageData: ImageData) => {
    processFrame(imageData);

    if (lastSignal) {
      const { bpm, isPeak, filteredValue } = heartBeatProcessor.processSignal(lastSignal.filteredValue);
      const intervals = heartBeatProcessor.getRRIntervals();
      setRRData(intervals);

      setResultData(prev => {
        const time = Date.now() - (Date.now() % 33);
        const last = prev[prev.length - 1];
        if (last && time - last.time < 33) {
          return prev;
        }
        return [...prev, { time: time % 30000, value: filteredValue, isPeak }];
      });
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative flex-1">
        <CameraView
          isMonitoring={isCameraActive}
          onError={setCameraError}
          onFrameProcessed={onFrameProcessed}
          isFingerDetected={lastSignal?.fingerDetected || false}
          signalQuality={lastSignal?.quality || 0}
        />

        <div className="absolute top-4 left-4 z-10">
          <div className="space-y-4">
            <SignalQualityIndicator quality={lastSignal?.quality || 0} />
            <PPGSignalMeter
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
            />
            {cameraError && (
              <div className="text-red-500 text-sm mt-2 bg-black/50 p-2 rounded">
                Error: {cameraError}
              </div>
            )}
          </div>
        </div>

        <div className="absolute top-4 right-4 z-10 space-y-2">
          <VitalSign
            label="BPM"
            value={currentBPM}
            unit="lpm"
          />
          <VitalSign
            label="SpO2"
            value={70}
            unit="%"
          />
          <VitalSign
            label="Presión"
            value={120/80}
            unit="mmHg"
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/80 backdrop-blur-sm z-20">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
          <Button 
            onClick={() => setIsCameraActive(!isCameraActive)} 
            disabled={isProcessing}
            variant="outline"
          >
            {isCameraActive ? "Detener Cámara" : "Iniciar Cámara"}
          </Button>
          
          <div className="flex gap-2">
            <Button 
              onClick={() => setIsCalibrating(true)} 
              disabled={isProcessing}
              variant="outline"
            >
              Calibrar
            </Button>
            <Button 
              onClick={startCapture} 
              disabled={!isCameraActive || isProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Capturar
            </Button>
            <Button 
              onClick={stopCapture} 
              disabled={!isProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              <Square className="w-4 h-4 mr-2" />
              Detener
            </Button>
          </div>
        </div>
      </div>

      <PPGResultDialog
        isOpen={showResults}
        onClose={() => setShowResults(false)}
        signalData={resultData}
        arrhythmias={arrhythmiaStatus}
      />

      <CalibrationDialog
        isOpen={isCalibrating}
        onClose={() => setIsCalibrating(false)}
        onCalibrationStart={() => setIsCalibrating(true)}
        onCalibrationEnd={async () => {
          const success = await calibrate();
          setIsCalibrating(false);
          if (success) {
            alert("Calibración exitosa!");
          } else {
            alert("Error en la calibración. Intenta de nuevo.");
          }
        }}
      />
    </div>
  );
};

export default Index;
