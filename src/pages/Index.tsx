
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import { Play, Square } from "lucide-react";

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
}

const INITIAL_VITAL_SIGNS: VitalSigns = {
  spo2: 0,
  pressure: "--/--",
  arrhythmiaStatus: "--"
};

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>(INITIAL_VITAL_SIGNS);
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const measurementTimerRef = useRef<number | null>(null);

  const { startProcessing, stopProcessing, lastSignal } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns } = useVitalSignsProcessor();

  const handleStreamReady = (stream: MediaStream) => {
    try {
      console.log("Stream ready, initializing video processing");
      
      const videoTrack = stream.getVideoTracks()[0];
      
      if (videoTrack) {
        videoTrack.enabled = true;
        
        if ('ImageCapture' in window) {
          const imageCapture = new (window as any).ImageCapture(videoTrack);
          imageCapture.torch?.(true).catch(console.error);
        }
      }
    } catch (error) {
      console.error("Error initializing video stream:", error);
    }
  };

  const startMonitoring = () => {
    setIsMonitoring(true);
    setIsCameraOn(true);
    startProcessing();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
    }
    
    measurementTimerRef.current = window.setInterval(() => {
      setElapsedTime(prev => {
        const next = prev + 1;
        if (next >= 30) {
          stopMonitoring();
          return 30;
        }
        return next;
      });
    }, 1000);
  };

  const stopMonitoring = () => {
    if (!isMonitoring) return;
    
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    resetMeasurement();
  };

  const resetMeasurement = () => {
    setVitalSigns(INITIAL_VITAL_SIGNS);
    setHeartRate(0);
    setArrhythmiaCount("--");
    setSignalQuality(0);
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
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
    </div>
  );
};

export default Index;
