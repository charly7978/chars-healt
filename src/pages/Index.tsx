import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';
import { toast } from "sonner";
import { useVitalMeasurement } from "@/hooks/useVitalMeasurement";
import { useRespiratoryMonitor } from '../hooks/useRespiratoryMonitor';
import RespiratoryMonitor from '../components/RespiratoryMonitor';

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
}

const MONITORING_DURATION = 45000; // 45 segundos

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MONITORING_DURATION / 1000);
  const [startTime, setStartTime] = useState(0);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [isUsingRearCamera, setIsUsingRearCamera] = useState(true);
  const [fps, setFps] = useState(0);
  const [showPermissionsHandler, setShowPermissionsHandler] = useState(true);
  const [isMeasurementCompleted, setIsMeasurementCompleted] = useState(false);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ spo2: 0, pressure: '0/0', arrhythmiaStatus: 'SIN ARRITMIAS|0' });
  const [finalSpo2, setFinalSpo2] = useState(0);
  const [finalPressure, setFinalPressure] = useState('0/0');
  const [finalHeartRate, setFinalHeartRate] = useState(0);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [showRecordedVideo, setShowRecordedVideo] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedVideoRef = useRef<HTMLVideoElement>(null);
  const frameProcessorRef = useRef<number | null>(null);
  const ffmpegRef = useRef<any>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const vitalMeasurement = useVitalMeasurement();
  const respiratoryMonitor = useRespiratoryMonitor();

  useEffect(() => {
    return () => {
      if (wakeLock) {
        wakeLock.release().then(() => {
          console.log('Screen wake lock released');
        });
      }
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (frameProcessorRef.current) {
        cancelAnimationFrame(frameProcessorRef.current);
      }
      
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, [wakeLock]);
  
  const handlePermissionsGranted = () => {
    setShowPermissionsHandler(false);
    prepareProcessorsOnly();
  };
  
  const handlePermissionsDenied = () => {
    toast.error("Se requieren permisos para utilizar la cámara");
  };
  
  const calculateFinalValues = () => {
    const finalBpm = VitalSignsRisk.getAverageBPM();
    const finalOxygen = VitalSignsRisk.getAverageSPO2();
    const finalBp = VitalSignsRisk.getAverageBP();
    
    setFinalHeartRate(finalBpm);
    setFinalSpo2(finalOxygen);
    setFinalPressure(`${finalBp.systolic}/${finalBp.diastolic}`);
    
    toast.success("¡Medición completada!");
  };

  const getArrhythmiaData = () => {
    const parts = vitalSigns.arrhythmiaStatus.split('|');
    if (parts.length === 2) {
      const count = parseInt(parts[1]);
      return { status: parts[0], count };
    }
    return { status: 'SIN ARRITMIAS', count: 0 };
  };

  const startMonitoring = () => {
    if (isMonitoring) return;

    prepareProcessorsOnly();
    vitalMeasurement.startMeasurement();
    
    respiratoryMonitor.startMonitoring();

    setTimeLeft(MONITORING_DURATION / 1000);
    setIsActive(true);
    setIsMonitoring(true);
    setHasMeasured(true);
    setIsMeasurementCompleted(false);
    setVitalSigns({ spo2: 0, pressure: '0/0', arrhythmiaStatus: 'SIN ARRITMIAS|0' });
    
    if (canvasRef.current && videoRef.current) {
      frameProcessorRef.current = requestAnimationFrame(processImage);
    }

    setStartTime(Date.now());
    timerRef.current = setInterval(() => {
      setTimeLeft(prevTime => {
        if (prevTime <= 1) {
          stopMonitoringOnly();
          clearInterval(timerRef.current);
          setIsMeasurementCompleted(true);
          calculateFinalValues();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    enterImmersiveMode();
  };

  const prepareProcessorsOnly = () => {
    vitalMeasurement.performMemoryCleanup();
    respiratoryMonitor.reset();
    
    setVitalSigns({ spo2: 0, pressure: '0/0', arrhythmiaStatus: 'SIN ARRITMIAS|0' });
    VitalSignsRisk.resetHistory();
  };

  const stopMonitoringOnly = () => {
    if (!isMonitoring) return;

    if (frameProcessorRef.current) {
      cancelAnimationFrame(frameProcessorRef.current);
      frameProcessorRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    vitalMeasurement.stopMeasurement();
    
    respiratoryMonitor.stopMonitoring();

    setIsMonitoring(false);
    setIsActive(false);
  };

  const handleReset = () => {
    stopMonitoringOnly();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (ffmpegRef.current) {
      ffmpegRef.current = null;
    }

    setIsMonitoring(false);
    setIsMeasurementCompleted(false);
    setIsActive(false);
    setTimeLeft(MONITORING_DURATION / 1000);
    setVitalSigns({ spo2: 0, pressure: '0/0', arrhythmiaStatus: 'SIN ARRITMIAS|0' });
    setShowRecordedVideo(false);
    
    vitalMeasurement.performMemoryCleanup();
    respiratoryMonitor.reset();
    
    VitalSignsRisk.resetHistory();
  };

  useEffect(() => {
    if (vitalMeasurement.lastSignal) {
      if (isMeasurementCompleted) return;
      
      setVitalSigns(prev => ({
        ...prev,
        spo2: vitalMeasurement.lastVitalSigns.spo2,
        pressure: vitalMeasurement.lastVitalSigns.pressure,
        arrhythmiaStatus: vitalMeasurement.lastVitalSigns.arrhythmiaStatus
      }));

      if (vitalMeasurement.lastVitalSigns.spo2 > 0) {
        VitalSignsRisk.updateSPO2History(vitalMeasurement.lastVitalSigns.spo2);
      }

      if (vitalMeasurement.lastVitalSigns.pressure !== '0/0') {
        const [systolic, diastolic] = vitalMeasurement.lastVitalSigns.pressure.split('/').map(Number);
        if (systolic > 0 && diastolic > 0) {
          VitalSignsRisk.updateBPHistory(systolic, diastolic);
        }
      }
    }
  }, [vitalMeasurement.lastVitalSigns, isMeasurementCompleted]);

  const handleStreamReady = (stream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  };

  const processImage = async () => {
    if (!frameProcessorRef.current || !canvasRef.current || !videoRef.current) {
      return;
    }

    try {
      const startTime = performance.now();

      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        return;
      }

      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;

      const size = Math.min(videoWidth, videoHeight);
      const left = (videoWidth - size) / 2;
      const top = (videoHeight - size) / 2;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (isUsingRearCamera) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(
        videoRef.current,
        left, top, size, size, 
        0, 0, canvas.width, canvas.height
      );

      if (isUsingRearCamera) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      const imageData = ctx.getImageData(
        0, 0, canvas.width, canvas.height
      );

      vitalMeasurement.processFrame(imageData);

      if (vitalMeasurement.lastSignal && 
          vitalMeasurement.lastSignal.quality > 0 && 
          vitalMeasurement.lastSignal.fingerDetected) {
        respiratoryMonitor.processSignal(
          vitalMeasurement.lastSignal.filteredValue, 
          vitalMeasurement.lastSignal.quality
        );
      }

      const processingTime = performance.now() - startTime;
      setFps(Math.round(1000 / processingTime));

      if (isMonitoring) {
        frameProcessorRef.current = requestAnimationFrame(processImage);
      }
    } catch (error) {
      console.error("Error processing frame", error);
      return;
    }
  };

  const enterImmersiveMode = async () => {
    try {
      if ('wakeLock' in navigator) {
        const wakeLock = await (navigator as any).wakeLock.request('screen');
        setWakeLock(wakeLock);
        console.log('Screen wake lock active');
        
        wakeLock.addEventListener('release', () => {
          console.log('Screen wake lock released');
          setWakeLock(null);
        });
      }
      
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
      
      document.addEventListener('click', handleInteraction);
      document.addEventListener('touchstart', handleInteraction);
      
      interactionTimeoutRef.current = setTimeout(() => {
        console.log('User inactive');
      }, 30000);
    } catch (err) {
      console.error('Error setting wake lock:', err);
    }
  };
  
  const handleInteraction = () => {
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    
    interactionTimeoutRef.current = setTimeout(() => {
      console.log('User inactive');
    }, 30000);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            CharsHealt Monitor
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 dark:text-gray-400">{fps} FPS</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
        {showPermissionsHandler ? (
          <PermissionsHandler 
            onPermissionsGranted={handlePermissionsGranted}
            onPermissionsDenied={handlePermissionsDenied}
          />
        ) : (
          <>
            <div className="relative w-full max-w-md aspect-square rounded-xl overflow-hidden bg-black">
              <CameraView 
                onStreamReady={handleStreamReady}
                isMonitoring={isMonitoring}
                isFingerDetected={vitalMeasurement.fingerDetected}
                signalQuality={vitalMeasurement.signalQuality}
              />
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-0" />
              <canvas ref={canvasRef} width={250} height={250} className="hidden" />
            </div>
            
            <div className="flex flex-col space-y-4 w-full max-w-md items-center">
              <PPGSignalMeter 
                value={vitalMeasurement.lastFiltered || 0}
                quality={vitalMeasurement.signalQuality}
                isFingerDetected={vitalMeasurement.fingerDetected}
                onStartMeasurement={startMonitoring}
                onReset={handleReset}
                arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
                rawArrhythmiaData={vitalMeasurement?.lastArrhythmiaData}
              />
              
              <div className="grid grid-cols-1 gap-4 w-full">
                <VitalSign
                  label="Saturación de Oxígeno"
                  value={isMeasurementCompleted ? finalSpo2 : vitalSigns.spo2}
                  unit="%"
                  isFinalReading={isMeasurementCompleted}
                />
                
                <VitalSign
                  label="Presión Arterial"
                  value={isMeasurementCompleted ? finalPressure : vitalSigns.pressure}
                  isFinalReading={isMeasurementCompleted}
                />
                
                <RespiratoryMonitor
                  respirationRate={respiratoryMonitor.respirationRate}
                  confidence={respiratoryMonitor.respirationConfidence}
                  breathingPattern={respiratoryMonitor.breathingPattern}
                  estimatedDepth={respiratoryMonitor.estimatedDepth}
                  isFinalReading={isMeasurementCompleted}
                />
                
                <VitalSign
                  label="Frecuencia Cardíaca"
                  value={isMeasurementCompleted ? finalHeartRate : (vitalMeasurement.lastBPM || 0)}
                  unit="BPM"
                  isFinalReading={isMeasurementCompleted}
                />
                
                {getArrhythmiaData().count > 0 && (
                  <VitalSign
                    label="Arritmias Detectadas"
                    value={getArrhythmiaData().count}
                    isFinalReading={isMeasurementCompleted}
                  />
                )}
              </div>
              
              {isActive && (
                <div className="flex items-center justify-center w-full">
                  <div className="text-lg font-semibold">
                    Tiempo restante: {timeLeft}s
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="border-t border-gray-200 bg-white py-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            © 2023 CharsHealt. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
