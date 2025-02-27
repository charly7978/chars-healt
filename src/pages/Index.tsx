import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';

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
  const [measurementComplete, setMeasurementComplete] = useState(false);
  const measurementTimerRef = useRef<number | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const startMonitoring = () => {
    if (isMonitoring) {
      handleMeasurementComplete();
    } else {
      resetAllValues();
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setMeasurementComplete(false);
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 40) {
            handleMeasurementComplete();
            return 40;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleMeasurementComplete = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    setMeasurementComplete(true);
    
    // Al completar, hacer las evaluaciones finales
    if (heartRate > 0) {
      const finalBpmRisk = VitalSignsRisk.getBPMRisk(heartRate, true);
      console.log("Evaluación final BPM:", finalBpmRisk);
    }
    
    if (vitalSigns.pressure !== "--/--" && vitalSigns.pressure !== "0/0") {
      const finalBPRisk = VitalSignsRisk.getBPRisk(vitalSigns.pressure, true);
      console.log("Evaluación final BP:", finalBPRisk);
    }
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
  };

  const resetAllValues = () => {
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--" 
    });
    setArrhythmiaCount("--");
    setSignalQuality(0);
    setLastArrhythmiaData(null);
    setElapsedTime(0);
    setMeasurementComplete(false);
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  };

  const handleReset = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    resetAllValues();
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
    const enterImmersiveMode = async () => {
      try {
        const viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
          viewport.setAttribute('content', 
            'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
          );
        }

        if (screen.orientation?.lock) {
          try {
            await screen.orientation.lock('portrait');
          } catch (e) {
            console.warn('Orientation lock failed:', e);
          }
        }

        const elem = document.documentElement;
        const methods = [
          elem.requestFullscreen?.bind(elem),
          elem.webkitRequestFullscreen?.bind(elem),
          elem.mozRequestFullScreen?.bind(elem),
          elem.msRequestFullscreen?.bind(elem)
        ];

        for (const method of methods) {
          if (method) {
            try {
              await method();
              break;
            } catch (e) {
              console.warn('Fullscreen attempt failed:', e);
              continue;
            }
          }
        }

        if (navigator.userAgent.includes("Android")) {
          if ((window as any).AndroidFullScreen?.immersiveMode) {
            try {
              await (window as any).AndroidFullScreen.immersiveMode();
            } catch (e) {
              console.warn('Android immersive mode failed:', e);
            }
          }
        }
      } catch (error) {
        console.error('Immersive mode error:', error);
      }
    };

    enterImmersiveMode();
    
    setTimeout(enterImmersiveMode, 500);
    setTimeout(enterImmersiveMode, 1500);

    const handleInteraction = () => {
      enterImmersiveMode();
    };

    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchend', handleInteraction);

    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchend', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      
      if (!measurementComplete) {
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
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, measurementComplete]);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden'
      }}
    >
      {/* Cámara de fondo - visible en toda la pantalla y sin filtros */}
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
          />
        </div>

        <div className="flex-1 mt-4" />

        {/* Displays con fondo simple - Ajustado tamaño y espaciado */}
        <div className="w-full px-4 mb-16">
          <div className="bg-gradient-to-b from-slate-900/90 to-black/90 backdrop-blur-sm p-4 rounded-xl border border-slate-800/30 shadow-2xl">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="transform scale-95">
                <VitalSign 
                  label="FRECUENCIA CARDÍACA"
                  value={heartRate || "--"}
                  unit="BPM"
                  isFinalReading={measurementComplete}
                />
              </div>
              <div className="transform scale-95">
                <VitalSign 
                  label="SPO2"
                  value={vitalSigns.spo2 || "--"}
                  unit="%"
                  isFinalReading={measurementComplete}
                />
              </div>
              <div className="transform scale-95">
                <VitalSign 
                  label="PRESIÓN ARTERIAL"
                  value={vitalSigns.pressure}
                  unit="mmHg"
                  isFinalReading={measurementComplete}
                />
              </div>
              <div className="transform scale-95">
                <VitalSign 
                  label="ARRITMIAS"
                  value={vitalSigns.arrhythmiaStatus}
                  isFinalReading={measurementComplete}
                />
              </div>
            </div>
          </div>
        </div>

        {isMonitoring && (
          <div className="fixed bottom-20 left-0 right-0 text-center z-20">
            <span className="text-xl font-medium text-white">{elapsedTime}s / 40s</span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 w-full h-[80px] grid grid-cols-2 gap-px">
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
