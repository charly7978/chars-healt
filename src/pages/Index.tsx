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

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  hasRespirationData: boolean;
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  } | null;
  hemoglobin: number | null;
  lastArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  cholesterol: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  };
}

const Index = () => {
  // Estados principales
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);

  // Referencias
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameRef = useRef<number>();
  const measurementTimerRef = useRef<number | null>(null);

  // Hooks de procesamiento
  const { startProcessing, stopProcessing, processFrame, lastSignal } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Estado de signos vitales
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({
    spo2: 0,
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiration: { rate: 0, depth: 0, regularity: 0 },
    hasRespirationData: false,
    glucose: { value: 0, trend: 'unknown' },
    hemoglobin: null,
    lastArrhythmiaData: null,
    cholesterol: {
      totalCholesterol: 0,
      hdl: 0,
      ldl: 0,
      triglycerides: 0
    }
  });

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos");
    setHasPermissions(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados");
    setHasPermissions(false);
    toast.error("Se requieren permisos de cámara para el funcionamiento");
  };

  const startMonitoring = () => {
    if (!hasPermissions) {
      toast.error("Se requieren permisos de cámara");
      return;
    }

    console.log("Iniciando monitoreo");
    setIsMonitoring(true);
    setIsCameraOn(true);
    startProcessing();
    resetHeartBeat();
    resetVitalSigns();
  };

  const stopMonitoring = () => {
    console.log("Deteniendo monitoreo");
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }

    // Resetear estados
    setHeartRate(0);
    setVitalSigns({
      spo2: 0,
      pressure: "--/--",
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: { value: 0, trend: 'unknown' },
      hemoglobin: null,
      lastArrhythmiaData: null,
      cholesterol: {
        totalCholesterol: 0,
        hdl: 0,
        ldl: 0,
        triglycerides: 0
      }
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    contextRef.current = context;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    const processVideoFrame = async () => {
      if (!isMonitoring || !contextRef.current || !canvas) return;

      try {
        contextRef.current.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = contextRef.current.getImageData(0, 0, canvas.width, canvas.height);
        
        processFrame(imageData);
        
        if (lastSignal) {
          const { quality, fingerDetected } = lastSignal;
          setSignalQuality(quality);
          
          if (fingerDetected) {
            const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
            
            if (heartBeatResult.isPeak) {
              processVitalSigns(
                lastSignal.filteredValue,
                { 
                  intervals: [], 
                  lastPeakTime: Date.now(),
                  amplitudes: [heartBeatResult.amplitude || 0]
                }
              );
            }
          }
        }
      } catch (error) {
        console.error("Error procesando frame:", error);
      }

      if (isMonitoring) {
        animationFrameRef.current = requestAnimationFrame(processVideoFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(processVideoFrame);
  };

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvasRef.current = canvas;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopMonitoring();
    };
  }, []);

  if (!hasPermissions) {
    return <PermissionsHandler 
      onPermissionsGranted={handlePermissionsGranted}
      onPermissionsDenied={handlePermissionsDenied}
    />;
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <CameraView
        onStreamReady={handleStreamReady}
        isMonitoring={isCameraOn}
        isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
        signalQuality={signalQuality}
      />
      
      <PPGSignalMeter
        value={lastSignal?.filteredValue || 0}
        quality={signalQuality}
        isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
        onStartMeasurement={startMonitoring}
        onReset={stopMonitoring}
        arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
      />

      <div className="fixed bottom-[70px] left-0 right-0 grid grid-cols-3 gap-2 p-2 bg-black/80 backdrop-blur">
        <VitalSign
          label="SpO2"
          value={vitalSigns.spo2}
          unit="%"
        />
        <VitalSign
          label="Presión"
          value={vitalSigns.pressure}
          unit="mmHg"
        />
        <VitalSign
          label="Colesterol"
          value={vitalSigns.cholesterol.totalCholesterol}
          unit="mg/dL"
          cholesterolData={vitalSigns.cholesterol}
        />
      </div>

      <div className="fixed bottom-0 left-0 right-0 h-[55px] grid grid-cols-2 gap-px">
        <button 
          onClick={startMonitoring}
          className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
          disabled={!hasPermissions}
          style={{ 
            backgroundImage: !hasPermissions 
              ? 'linear-gradient(135deg, #64748b, #475569, #334155)'
              : isMonitoring 
                ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
                : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
            textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
            opacity: !hasPermissions ? 0.7 : 1
          }}
        >
          {!hasPermissions ? 'PERMISOS REQUERIDOS' : (isMonitoring ? 'DETENER' : 'INICIAR')}
        </button>
        <button 
          onClick={stopMonitoring}
          className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
          style={{ 
            backgroundImage: 'linear-gradient(135deg, #64748b, #475569, #334155)',
            textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)'
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
};

export default Index;
