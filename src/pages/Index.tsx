
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
  const [finalValues, setFinalValues] = useState<{
    heartRate: number,
    spo2: number,
    pressure: string
  } | null>(null);
  const measurementTimerRef = useRef<number | null>(null);
  
  // Nuevos arrays para almacenar todos los valores durante la medición
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allSpo2ValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  
  // Flag para trackear si ya tenemos valores válidos que queremos preservar
  const hasValidValuesRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const calculateFinalValues = () => {
    try {
      console.log("Calculando PROMEDIOS REALES con todos los valores capturados...");
      
      const validHeartRates = allHeartRateValuesRef.current.filter(v => v > 0);
      const validSpo2Values = allSpo2ValuesRef.current.filter(v => v > 0);
      const validSystolicValues = allSystolicValuesRef.current.filter(v => v > 0);
      const validDiastolicValues = allDiastolicValuesRef.current.filter(v => v > 0);
      
      console.log("Valores acumulados para promedios:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length
      });
      
      let avgHeartRate = 0;
      let avgSpo2 = 0;
      let avgSystolic = 0;
      let avgDiastolic = 0;
      
      if (validHeartRates.length > 0) {
        avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
      } else {
        avgHeartRate = heartRate;
      }
      
      if (validSpo2Values.length > 0) {
        avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
      } else {
        avgSpo2 = vitalSigns.spo2;
      }
      
      let finalBPString = vitalSigns.pressure;
      if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
        avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
        avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
        finalBPString = `${avgSystolic}/${avgDiastolic}`;
      }
      
      console.log("PROMEDIOS REALES calculados:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString
      });
      
      setFinalValues({
        heartRate: avgHeartRate > 0 ? avgHeartRate : heartRate,
        spo2: avgSpo2 > 0 ? avgSpo2 : vitalSigns.spo2,
        pressure: finalBPString
      });
        
      hasValidValuesRef.current = true;
      
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      setFinalValues({
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure
      });
      hasValidValuesRef.current = true;
    }
  };

  const startMonitoring = () => {
    if (isMonitoring) {
      stopMonitoringOnly();
    } else {
      prepareProcessorsOnly();
      
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setMeasurementComplete(false);
      
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 40) {
            stopMonitoringOnly();
            return 40;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const prepareProcessorsOnly = () => {
    console.log("Preparando SOLO procesadores (displays intactos)");
    
    setElapsedTime(0);
    
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  };

  const stopMonitoringOnly = () => {
    try {
      console.log("Deteniendo SOLO monitorización (displays intactos)");
      
      setIsMonitoring(false);
      setIsCameraOn(false);
      stopProcessing();
      setMeasurementComplete(true);
      
      try {
        if (heartRate > 0) {
          VitalSignsRisk.getBPMRisk(heartRate, true);
        }
      } catch (err) {
        console.error("Error al evaluar riesgo BPM:", err);
      }
      
      try {
        if (vitalSigns.pressure !== "--/--" && vitalSigns.pressure !== "0/0") {
          VitalSignsRisk.getBPRisk(vitalSigns.pressure, true);
        }
      } catch (err) {
        console.error("Error al evaluar riesgo BP:", err);
      }
      
      try {
        if (vitalSigns.spo2 > 0) {
          VitalSignsRisk.getSPO2Risk(vitalSigns.spo2, true);
        }
      } catch (err) {
        console.error("Error al evaluar riesgo SPO2:", err);
      }
      
      calculateFinalValues();
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    } catch (error) {
      console.error("Error en stopMonitoringOnly:", error);
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      setIsMonitoring(false);
      setIsCameraOn(false);
    }
  };

  const handleReset = () => {
    console.log("RESET COMPLETO solicitado");
    
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--" 
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    setElapsedTime(0);
    setMeasurementComplete(false);
    setFinalValues(null);
    
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
    
    hasValidValuesRef.current = false;
    
    allHeartRateValuesRef.current = [];
    allSpo2ValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
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
      try {
        const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
        
        if (!measurementComplete) {
          if (heartBeatResult.bpm > 0) {
            setHeartRate(heartBeatResult.bpm);
            allHeartRateValuesRef.current.push(heartBeatResult.bpm);
          }
          
          const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            if (vitals.spo2 > 0) {
              setVitalSigns(current => ({
                ...current,
                spo2: vitals.spo2
              }));
              allSpo2ValuesRef.current.push(vitals.spo2);
            }
            
            if (vitals.pressure !== "--/--" && vitals.pressure !== "0/0") {
              setVitalSigns(current => ({
                ...current,
                pressure: vitals.pressure
              }));
              
              const [systolic, diastolic] = vitals.pressure.split('/').map(Number);
              if (systolic > 0 && diastolic > 0) {
                allSystolicValuesRef.current.push(systolic);
                allDiastolicValuesRef.current.push(diastolic);
              }
            }
            
            setVitalSigns(current => ({
              ...current,
              arrhythmiaStatus: vitals.arrhythmiaStatus
            }));
            
            if (vitals.lastArrhythmiaData) {
              setLastArrhythmiaData(vitals.lastArrhythmiaData);
              
              const [status, count] = vitals.arrhythmiaStatus.split('|');
              setArrhythmiaCount(count || "0");
            }
          }
        }
        
        setSignalQuality(lastSignal.quality);
      } catch (error) {
        console.error("Error procesando señal:", error);
      }
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, measurementComplete]);

  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      className="fixed inset-0" 
      style={{ 
        height: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CameraView 
        onStreamReady={handleStreamReady}
        isMonitoring={isCameraOn}
        isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
        signalQuality={isMonitoring ? signalQuality : 0}
      />

      <div className="flex-1 flex flex-col z-10">
        <PPGSignalMeter 
          value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
          quality={isMonitoring ? lastSignal?.quality || 0 : 0}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
          onStartMeasurement={startMonitoring}
          onReset={handleReset}
          arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
          rawArrhythmiaData={lastArrhythmiaData}
        />
      </div>

      {/* Reducido el tamaño del bloque de displays */}
      <div className="fixed bottom-[90px] left-0 right-0 px-3 z-20">
        <div className="p-2 bg-black/60 rounded-lg">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VitalSign 
              label="FRECUENCIA CARDÍACA"
              value={finalValues ? finalValues.heartRate : heartRate || "--"}
              unit="BPM"
              isFinalReading={measurementComplete}
            />
            <VitalSign 
              label="SPO2"
              value={finalValues ? finalValues.spo2 : vitalSigns.spo2 || "--"}
              unit="%"
              isFinalReading={measurementComplete}
            />
            <VitalSign 
              label="PRESIÓN ARTERIAL"
              value={finalValues ? finalValues.pressure : vitalSigns.pressure}
              unit="mmHg"
              isFinalReading={measurementComplete}
            />
            <VitalSign 
              label="ARRITMIAS"
              value={vitalSigns.arrhythmiaStatus}
              isFinalReading={measurementComplete}
            />
          </div>
        </div>
      </div>

      {/* Eliminado el contador de segundos */}

      {/* Reducido levemente la botonera */}
      <div className="fixed bottom-0 left-0 right-0 w-full h-[55px] grid grid-cols-2 gap-px z-50">
        <button 
          onClick={startMonitoring}
          className="w-full h-full text-xl font-bold text-white transition-colors duration-200 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800"
          style={{ 
            backgroundImage: isMonitoring 
              ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
              : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
            textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)'
          }}
        >
          {isMonitoring ? 'DETENER' : 'INICIAR'}
        </button>
        <button 
          onClick={handleReset}
          className="w-full h-full text-xl font-bold text-white transition-colors duration-200 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 active:from-gray-800 active:to-gray-900"
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
