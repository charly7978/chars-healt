import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
}

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);
  const measurementTimerRef = useRef<number | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const enterImmersiveMode = async () => {
    console.log('Intentando activar modo inmersivo...');
    
    // 1. Bloquear orientación primero
    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock('portrait');
      }
    } catch (e) {
      console.log('Error orientation lock:', e);
    }

    // 2. Intentar modo inmersivo Android
    if (navigator.userAgent.includes("Android")) {
      try {
        if ((window as any).AndroidFullScreen?.immersiveMode) {
          console.log('Intentando modo inmersivo Android...');
          await (window as any).AndroidFullScreen.immersiveMode();
        }
      } catch (e) {
        console.log('Error Android immersive:', e);
      }
    }

    // 3. Intentar fullscreen en diferentes elementos
    const elements = [
      document.documentElement,
      document.body,
      document.getElementById('root')
    ].filter(Boolean);

    for (const method of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitEnterFullscreen', 'mozRequestFullScreen', 'msRequestFullscreen']) {
      for (const element of elements) {
        if (element && element[method]) {
          try {
            console.log(`Intentando ${method} en`, element);
            await element[method]();
            console.log(`Éxito con ${method}`);
            break;
          } catch (e) {
            console.log(`Error con ${method}:`, e);
          }
        }
      }
    }
  };

  useEffect(() => {
    console.log('Iniciando secuencia de inmersión...');
    
    // Configuración inicial de orientación y viewport
    const viewport = document.querySelector('meta[name=viewport]');
    if (viewport) {
      viewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, minimal-ui, orientation=portrait'
      );
    }

    // Estilos CSS para prevenir selección y zoom
    const style = document.createElement('style');
    style.textContent = `
      * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      html, body {
        touch-action: none;
        overflow: hidden;
        overscroll-behavior: none;
        height: 100vh;
        position: fixed;
        width: 100%;
      }
    `;
    document.head.appendChild(style);

    // Prevenir scroll y gestos
    const preventDefaultAndPropagation = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const events = [
      'touchmove', 'scroll', 'gesturestart', 'gesturechange', 'gestureend',
      'touchstart', 'touchend', 'wheel', 'mousewheel'
    ];

    events.forEach(eventName => {
      document.body.addEventListener(eventName, preventDefaultAndPropagation, { passive: false });
    });

    // Intentos de modo inmersivo
    enterImmersiveMode();
    requestAnimationFrame(enterImmersiveMode);
    const attempts = [
      setTimeout(() => enterImmersiveMode(), 100),
      setTimeout(() => enterImmersiveMode(), 500),
      setTimeout(() => enterImmersiveMode(), 1000)
    ];

    // Cleanup
    return () => {
      events.forEach(eventName => {
        document.body.removeEventListener(eventName, preventDefaultAndPropagation);
      });
      attempts.forEach(clearTimeout);
      document.head.removeChild(style);
    };
  }, []);

  const startMonitoring = () => {
    if (isMonitoring) {
      handleReset();
    } else {
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setVitalSigns(prev => ({
        ...prev,
        arrhythmiaStatus: "SIN ARRITMIAS|0"
      }));
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 30) {
            handleReset();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleReset = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
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
    setLastArrhythmiaData(null);
  };

  const handleStreamReady = (stream: MediaStream) => {
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
    
    const processImage = async () => {
      if (!isMonitoring) return;
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
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
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        
        if (vitals.lastArrhythmiaData) {
          setLastArrhythmiaData(vitals.lastArrhythmiaData);
          
          const [status, count] = vitals.arrhythmiaStatus.split('|');
          setArrhythmiaCount(count || "0");
          
          setVitalSigns(current => ({
            ...current,
            arrhythmiaStatus: vitals.arrhythmiaStatus
          }));
        }
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black/90" 
      style={{ 
        height: '100dvh',
        minHeight: '-webkit-fill-available',
        touchAction: 'none',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        overscrollBehavior: 'none'
      }}
      onClick={enterImmersiveMode}
    >
      <div className="absolute inset-0 z-0">
        <CameraView 
          onStreamReady={handleStreamReady}
          isMonitoring={isCameraOn}
          isFingerDetected={lastSignal?.fingerDetected}
          signalQuality={signalQuality}
        />
      </div>

      <div 
        className="relative z-10 flex flex-col h-full"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        <div className="h-[50dvh]">
          <PPGSignalMeter 
            value={lastSignal?.filteredValue || 0}
            quality={lastSignal?.quality || 0}
            isFingerDetected={lastSignal?.fingerDetected || false}
            onStartMeasurement={startMonitoring}
            onReset={handleReset}
            arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
            rawArrhythmiaData={lastArrhythmiaData}
            fingerSize="lg"
          />
        </div>

        <div className="flex-1 mt-24" />

        <div className="w-full px-4 pb-8">
          <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        </div>

        {isMonitoring && (
          <div className="fixed bottom-20 left-0 right-0 text-center z-20">
            <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 30s</span>
          </div>
        )}

        <div className="relative w-full h-[80px] grid grid-cols-2 gap-px">
          <button 
            onClick={startMonitoring}
            className={`w-full h-full text-2xl font-bold text-white transition-colors duration-200 ${
              isMonitoring
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800'
            }`}
          >
            {isMonitoring ? 'DETENER' : 'INICIAR'}
          </button>
          <button 
            onClick={handleReset}
            className="w-full h-full text-2xl font-bold text-white bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 active:from-gray-800 active:to-gray-900 transition-colors duration-200"
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
