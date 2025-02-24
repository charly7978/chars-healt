
import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";

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
  const measurementTimerRef = useRef<number | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const requestFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.log('Error al entrar en pantalla completa:', err);
    }
  };

  useEffect(() => {
    const lockOrientation = async () => {
      try {
        if (screen.orientation?.lock) {
          await screen.orientation.lock('portrait');
        }
      } catch (error) {
        console.log('Error al bloquear orientación:', error);
      }
    };

    const preventScroll = (e: Event) => {
      e.preventDefault();
    };

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    // Bloquear orientación
    lockOrientation();
    
    // Prevenir scroll y gestos
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.touchAction = 'none';
    
    // Event listeners
    const options = { passive: false };
    document.addEventListener('touchmove', preventScroll, options);
    document.addEventListener('scroll', preventScroll, options);
    document.addEventListener('contextmenu', preventContextMenu);
    
    // Solicitar pantalla completa al inicio
    requestFullScreen();

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('scroll', preventScroll);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.touchAction = '';
    };
  }, []);

  const startMonitoring = () => {
    if (isMonitoring) {
      handleReset();
    } else {
      requestFullScreen();
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
      // Procesar latidos cardíacos
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      // Procesar signos vitales y arritmias
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(prevVitals => ({
          ...prevVitals,
          ...vitals
        }));
        
        // Si el status contiene información de arritmia, actualizar el contador
        if (vitals.arrhythmiaStatus) {
          const [status, count] = vitals.arrhythmiaStatus.split('|');
          setArrhythmiaCount(count || "0");
        }
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black select-none touch-none"
      style={{ 
        minHeight: '-webkit-fill-available',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady}
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col">
          <div className="flex-1">
            <PPGSignalMeter 
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
              onStartMeasurement={startMonitoring}
              onReset={handleReset}
              arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
            />
          </div>

          <div className="absolute bottom-24 left-0 right-0 px-4">
            <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl p-4">
              <div className="grid grid-cols-2 gap-4">
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
            <div className="absolute bottom-16 left-0 right-0 text-center">
              <span className="text-xl font-medium text-gray-300">
                {elapsedTime}s / 30s
              </span>
            </div>
          )}

          <div className="h-[80px] grid grid-cols-2 gap-px bg-gray-900 mt-auto">
            <button 
              onClick={startMonitoring}
              className="w-full h-full bg-black/80 text-2xl font-bold text-white active:bg-gray-800 select-none"
            >
              INICIAR
            </button>
            <button 
              onClick={handleReset}
              className="w-full h-full bg-black/80 text-2xl font-bold text-white active:bg-gray-800 select-none"
            >
              RESET
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
