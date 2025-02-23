
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

  const cameraViewRef = useRef<any>(null);
  const {
    isProcessing,
    lastSignal,
    error,
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

  const toggleCamera = async () => {
    if (!cameraViewRef.current) return;

    if (!isCameraActive) {
      try {
        await cameraViewRef.current.startCamera();
        setIsCameraActive(true);
        setCameraError(null);
      } catch (err: any) {
        console.error("Error starting camera:", err);
        setCameraError(err.message || "Failed to start camera.");
        setLastErrorMessage(err.message || "Failed to start camera.");
      }
    } else {
      cameraViewRef.current.stopCamera();
      setIsCameraActive(false);
    }
  };

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

  const handleCalibrationStart = () => {
    setIsCalibrating(true);
  };

  const handleCalibrationClose = () => {
    setIsCalibrating(false);
  };

  const handleCalibration = async () => {
    const success = await calibrate();
    setIsCalibrating(false);
    if (success) {
      alert("Calibración exitosa!");
    } else {
      alert("Error en la calibración. Intenta de nuevo.");
    }
  };

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <CameraView
          active={isCameraActive}
          onError={setCameraError}
          onFrameProcessed={onFrameProcessed}
        />

        <div className="absolute top-4 left-4 z-10 text-white">
          <div className="flex items-center space-x-2">
            <SignalQualityIndicator quality={lastSignal?.quality || 0} />
            <PPGSignalMeter
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
            />
          </div>
          {cameraError && (
            <div className="text-red-500 text-sm mt-2">
              Error de cámara: {cameraError}
            </div>
          )}
          {lastErrorMessage && (
            <div className="text-red-500 text-sm mt-2">
              Último error: {lastErrorMessage}
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between">
          <Button onClick={toggleCamera} disabled={isProcessing}>
            {isCameraActive ? "Detener Cámara" : "Iniciar Cámara"}
          </Button>
          <div>
            <Button onClick={handleCalibrationStart} disabled={isProcessing}>
              Calibrar
            </Button>
            <Button className="ml-2" onClick={startCapture} disabled={isProcessing}>
              <Play className="mr-2 h-4 w-4" />
              Capturar
            </Button>
            <Button onClick={stopCapture} disabled={!isProcessing}>
              <Square className="mr-2 h-4 w-4" />
              Detener
            </Button>
          </div>
        </div>

        <div className="absolute top-4 right-4 z-10 text-white">
          <VitalSign
            label="BPM"
            value={heartBeatProcessor.getFinalBPM()}
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

        <PPGResultDialog
          isOpen={showResults}
          onClose={() => setShowResults(false)}
          signalData={resultData}
          arrhythmias={arrhythmiaStatus}
        />

        <CalibrationDialog
          isOpen={isCalibrating}
          onClose={handleCalibrationClose}
          onCalibrationStart={handleCalibrationStart}
          onCalibrationEnd={handleCalibration}
        />
      </div>
    </div>
  );
};

export default Index;
