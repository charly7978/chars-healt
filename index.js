
import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import VitalSign from "@/components/VitalSign";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import { debounce, frameDebounce } from "@/utils/debounceUtils";
import { cached } from "@/utils/cacheUtils";
import PermissionsHandler from "@/components/PermissionsHandler";

// Componentes con carga diferida
const CameraView = lazy(() => import("@/components/CameraView"));
const PPGSignalMeter = lazy(() => import("@/components/PPGSignalMeter"));

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const measurementTimerRef = useRef(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Caché para procesar resultados y evitar cálculos duplicados
  const cachedProcessHeartBeat = cached(processHeartBeat, (value) => `heartbeat-${Math.round(value)}`, 500);
  
  // Aplicar antirrebote al procesamiento de frames
  const debouncedProcessFrame = frameDebounce(processFrame, 2);

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
  };

  const enterFullScreen = debounce(async () => {
    const elem = document.documentElement;
    try {
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        await elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
      }
    } catch (err) {
      console.log('Error al entrar en pantalla completa:', err);
    }
  }, 300);

  useEffect(() => {
    const preventScroll = (e) => e.preventDefault();
    
    const lockOrientation = async () => {
      try {
        if (screen.orientation?.lock) {
          await screen.orientation.lock('portrait');
        }
      } catch (error) {
        console.log('No se pudo bloquear la orientación:', error);
      }
    };
    
    lockOrientation();
    
    document.body.addEventListener('touchmove', preventScroll, { passive: false });
    document.body.addEventListener('scroll', preventScroll, { passive: false });

    return () => {
      document.body.removeEventListener('touchmove', preventScroll);
      document.body.removeEventListener('scroll', preventScroll);
    };
  }, []);

  const startMonitoring = () => {
    if (!permissionsGranted) {
      console.log("No se puede iniciar sin permisos");
      return;
    }
    
    enterFullScreen();
    setIsMonitoring(true);
    setIsCameraOn(true);
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
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    resetVitalSigns();
    setElapsedTime(0);
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--" 
    });
    setArrhythmiaCount("--");
    setSignalQuality(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
  };

  const handleStreamReady = (stream) => {
    if (!isMonitoring) return;
    
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
      console.error("No se pudo obtener el contexto 2D");
      return;
    }
    
    // Optimización: uso de requestAnimationFrame y skip de frames
    let frameCount = 0;
    const processImage = async () => {
      if (!isMonitoring) return;
      
      try {
        // Procesamos solo 1 de cada 2 frames para reducir carga
        frameCount++;
        if (frameCount % 2 === 0) {
          const frame = await imageCapture.grabFrame();
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          debouncedProcessFrame(imageData);
        }
        
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
      const heartBeatResult = cachedProcessHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus.split('|')[1] || "--");
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, cachedProcessHeartBeat, processVitalSigns]);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: 'calc(100vh + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      <PermissionsHandler 
        onPermissionsGranted={handlePermissionsGranted}
        onPermissionsDenied={handlePermissionsDenied}
      />
      
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <Suspense fallback={<div className="w-full h-full bg-black flex items-center justify-center text-white">Cargando cámara...</div>}>
            <CameraView 
              onStreamReady={handleStreamReady}
              isMonitoring={isCameraOn && permissionsGranted}
              isFingerDetected={lastSignal?.fingerDetected}
              signalQuality={signalQuality}
            />
          </Suspense>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[400px] bg-gradient-to-t from-black/90 via-black/80 to-black/30 z-10"></div>

        <div className="relative z-20 h-full flex flex-col">
          <div className="flex-1">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white">Cargando monitor...</div>}>
              <PPGSignalMeter 
                value={lastSignal?.filteredValue || 0}
                quality={lastSignal?.quality || 0}
                isFingerDetected={lastSignal?.fingerDetected || false}
                onStartMeasurement={startMonitoring}
                onReset={stopMonitoring}
                arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
              />
            </Suspense>
          </div>

          <div className="absolute bottom-[200px] left-0 right-0 px-4 z-30">
            <div className="grid grid-cols-4 gap-2">
              <VitalSign 
                label="FRECUENCIA CARDÍACA"
                value={heartRate || "--"}
                unit="BPM"
              />
              <VitalSign 
                label="SPO2"
                value={vitalSigns.spo2 || "--"}
                unit="%"
              />
              <VitalSign 
                label="PRESIÓN ARTERIAL"
                value={vitalSigns.pressure}
                unit="mmHg"
              />
              <VitalSign 
                label="ARRITMIAS"
                value={vitalSigns.arrhythmiaStatus}
              />
            </div>
          </div>

          {isMonitoring && (
            <div className="absolute bottom-40 left-0 right-0 text-center z-30">
              <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 30s</span>
            </div>
          )}

          <div className="h-[80px] grid grid-cols-2 gap-px bg-gray-900 mt-auto relative z-30">
            <button 
              onClick={startMonitoring}
              className={`w-full h-full text-2xl font-bold text-white active:bg-gray-800 ${!permissionsGranted ? 'bg-gray-600' : 'bg-black/80'}`}
              disabled={!permissionsGranted}
            >
              {!permissionsGranted ? 'PERMISOS REQUERIDOS' : 'INICIAR'}
            </button>
            <button 
              onClick={stopMonitoring}
              className="w-full h-full bg-black/80 text-2xl font-bold text-white active:bg-gray-800"
            >
              RESET
            </button>
          </div>
          
          {!permissionsGranted && (
            <div className="absolute bottom-20 left-0 right-0 text-center px-4 z-30">
              <span className="text-lg font-medium text-red-400">
                La aplicación necesita permisos de cámara para funcionar correctamente
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
