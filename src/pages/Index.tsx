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
import { VitalSignsProcessorResult } from "@/types/signal";
import { VitalSigns, initialVitalSigns } from '@/types/VitalSigns';

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>(initialVitalSigns);
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
    pressure: string,
    respiration: {
      rate: number;
      depth: number;
      regularity: number;
    },
    glucose: {
      value: number;
      trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
    },
    hemoglobin: number | null
  } | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  const measurementTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allSpo2ValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  const allRespirationRateValuesRef = useRef<number[]>([]);
  const allRespirationDepthValuesRef = useRef<number[]>([]);
  const allGlucoseValuesRef = useRef<number[]>([]);
  const allHemoglobinValuesRef = useRef<number[]>([]);
  
  const hasValidValuesRef = useRef(false);
  
  const { startProcessing, stopProcessing, processFrame, lastSignal } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos");
    setHasPermissions(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados");
    setHasPermissions(false);
    toast.error("Se requieren permisos de cámara para el funcionamiento");
  };

  const calculateFinalValues = () => {
    try {
      console.log("Calculando PROMEDIOS REALES con todos los valores capturados...");
      
      const validHeartRates = allHeartRateValuesRef.current.filter(v => v > 0);
      const validSpo2Values = allSpo2ValuesRef.current.filter(v => v > 0);
      const validSystolicValues = allSystolicValuesRef.current.filter(v => v > 0);
      const validDiastolicValues = allDiastolicValuesRef.current.filter(v => v > 0);
      const validRespRates = allRespirationRateValuesRef.current.filter(v => v > 0);
      const validRespDepths = allRespirationDepthValuesRef.current.filter(v => v > 0);
      const validGlucoseValues = allGlucoseValuesRef.current.filter(v => v > 0);
      const validHemoglobinValues = allHemoglobinValuesRef.current.filter(v => v > 0);
      
      console.log("Valores acumulados para promedios:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length,
        respirationRates: validRespRates.length,
        respirationDepths: validRespDepths.length,
        glucoseValues: validGlucoseValues.length,
        hemoglobinValues: validHemoglobinValues.length
      });
      
      let avgHeartRate = 0;
      if (validHeartRates.length > 0) {
        avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
      } else {
        avgHeartRate = heartRate;
      }
      
      let avgSpo2 = 0;
      if (validSpo2Values.length > 0) {
        avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
      } else {
        avgSpo2 = vitalSigns.spo2;
      }
      
      let finalBPString = vitalSigns.pressure;
      if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
        let avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
        let avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
        finalBPString = `${avgSystolic}/${avgDiastolic}`;
      }
      
      let avgRespRate = 0;
      if (validRespRates.length > 0) {
        avgRespRate = Math.round(validRespRates.reduce((a, b) => a + b, 0) / validRespRates.length);
      } else {
        avgRespRate = vitalSigns.respiration.rate;
      }
      
      let avgRespDepth = 0;
      if (validRespDepths.length > 0) {
        avgRespDepth = Math.round(validRespDepths.reduce((a, b) => a + b, 0) / validRespDepths.length);
      } else {
        avgRespDepth = vitalSigns.respiration.depth;
      }
      
      let avgGlucose = 0;
      if (validGlucoseValues.length > 0) {
        avgGlucose = Math.round(validGlucoseValues.reduce((a, b) => a + b, 0) / validGlucoseValues.length);
      } else {
        avgGlucose = vitalSigns.glucose.value;
      }

      let avgHemoglobin = null;
      if (validHemoglobinValues.length > 0) {
        avgHemoglobin = Math.round(validHemoglobinValues.reduce((a, b) => a + b, 0) / validHemoglobinValues.length);
      } else {
        avgHemoglobin = vitalSigns.hemoglobin.value;
      }
      
      console.log("PROMEDIOS REALES calculados:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString,
        respiration: { rate: avgRespRate, depth: avgRespDepth },
        glucose: avgGlucose,
        hemoglobin: avgHemoglobin
      });
      
      let glucoseTrend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' = 'unknown';
      if (validGlucoseValues.length >= 3) {
        const recentValues = validGlucoseValues.slice(-3);
        const changes = [];
        for (let i = 1; i < recentValues.length; i++) {
          changes.push(recentValues[i] - recentValues[i-1]);
        }
        
        const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
        
        if (Math.abs(avgChange) < 2) {
          glucoseTrend = 'stable';
        } else if (avgChange > 5) {
          glucoseTrend = 'rising_rapidly';
        } else if (avgChange > 2) {
          glucoseTrend = 'rising';
        } else if (avgChange < -5) {
          glucoseTrend = 'falling_rapidly';
        } else if (avgChange < -2) {
          glucoseTrend = 'falling';
        }
      }
      
      setFinalValues({
        heartRate: avgHeartRate > 0 ? avgHeartRate : heartRate,
        spo2: avgSpo2 > 0 ? avgSpo2 : vitalSigns.spo2,
        pressure: finalBPString,
        respiration: {
          rate: avgRespRate > 0 ? avgRespRate : vitalSigns.respiration.rate,
          depth: avgRespDepth > 0 ? avgRespDepth : vitalSigns.respiration.depth,
          regularity: vitalSigns.respiration.regularity
        },
        glucose: {
          value: avgGlucose > 0 ? avgGlucose : vitalSigns.glucose.value,
          trend: glucoseTrend
        },
        hemoglobin: avgHemoglobin
      });
        
      hasValidValuesRef.current = true;
      
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
      allRespirationRateValuesRef.current = [];
      allRespirationDepthValuesRef.current = [];
      allGlucoseValuesRef.current = [];
      allHemoglobinValuesRef.current = [];
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      setFinalValues({
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure,
        respiration: vitalSigns.respiration,
        glucose: vitalSigns.glucose,
        hemoglobin: vitalSigns.hemoglobin.value
      });
      hasValidValuesRef.current = true;
    }
  };

  const startMonitoring = () => {
    if (!hasPermissions) {
      toast.error("Se requieren permisos de cámara");
      return;
    }

    console.log("Iniciando monitoreo");
    setIsMonitoring(true);
    startProcessing();
    resetHeartBeat();
    resetVitalSigns();
  };

  const stopMonitoring = () => {
    console.log("Deteniendo monitoreo");
    setIsMonitoring(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    setHeartRate(0);
    setVitalSigns(initialVitalSigns);
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
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
    allHemoglobinValuesRef.current = [];
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        console.error("No video track available in stream");
        return;
      }
      
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
      
      let frameProcessingActive = true;
      
      const processImage = async () => {
        if (!isMonitoring || !frameProcessingActive) return;
        
        try {
          if (videoTrack.readyState !== 'live') {
            console.log('Video track is not in live state, waiting...');
            if (isMonitoring && frameProcessingActive) {
              setTimeout(() => requestAnimationFrame(processImage), 500);
            }
            return;
          }
          
          const frame = await imageCapture.grabFrame();
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          processFrame(imageData);
          
          if (isMonitoring && frameProcessingActive) {
            requestAnimationFrame(processImage);
          }
        } catch (error) {
          console.error("Error capturando frame:", error);
          if (isMonitoring && frameProcessingActive) {
            setTimeout(() => requestAnimationFrame(processImage), 500);
          }
        }
      };

      processImage();
      
      return () => {
        console.log("Cleaning up video processing resources");
        frameProcessingActive = false;
        
        if (videoTrack.getCapabilities()?.torch) {
          videoTrack.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
      };
    } catch (error) {
      console.error("Error setting up image capture:", error);
      return () => {};
    }
  };

  useEffect(() => {
    if (!isMonitoring && isCameraOn) {
      try {
        const tracks = navigator.mediaDevices
          .getUserMedia({ video: true })
          .then(stream => {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getCapabilities()?.torch) {
              videoTrack.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(err => console.error("Error desactivando linterna:", err));
            }
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => console.error("Error al intentar apagar la linterna:", err));
      } catch (err) {
        console.error("Error al acceder a la cámara para apagar la linterna:", err);
      }
    }
  }, [isMonitoring, isCameraOn]);

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
    
    const immersiveTimeout = setTimeout(enterImmersiveMode, 1000);

    const handleInteraction = () => {
      enterImmersiveMode();
    };

    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction, { passive: true });

    return () => {
      clearTimeout(immersiveTimeout);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
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
          
          const vitals: VitalSignsProcessorResult = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            console.log("Raw vital signs data:", JSON.stringify(vitals));
            
            setVitalSigns(current => {
              const updated = { ...current };
              
              if (vitals.spo2 > 0) {
                updated.spo2 = vitals.spo2;
                allSpo2ValuesRef.current.push(vitals.spo2);
              }
              
              if (vitals.pressure !== "--/--" && vitals.pressure !== "0/0") {
                updated.pressure = vitals.pressure;
                
                const [systolic, diastolic] = vitals.pressure.split('/').map(Number);
                if (systolic > 0 && diastolic > 0) {
                  allSystolicValuesRef.current.push(systolic);
                  allDiastolicValuesRef.current.push(diastolic);
                }
              }
              
              updated.arrhythmiaStatus = vitals.arrhythmiaStatus;
              
              if (vitals.hasRespirationData && vitals.respiration) {
                console.log("Procesando datos de respiración:", vitals.respiration);
                updated.respiration = vitals.respiration;
                updated.hasRespirationData = true;
                
                if (vitals.respiration.rate > 0) {
                  allRespirationRateValuesRef.current.push(vitals.respiration.rate);
                }
                
                if (vitals.respiration.depth > 0) {
                  allRespirationDepthValuesRef.current.push(vitals.respiration.depth);
                }
              }
              
              if (vitals.glucose) {
                console.log("Actualizando UI con datos de glucosa:", vitals.glucose);
                updated.glucose = {
                  value: vitals.glucose.value,
                  trend: vitals.glucose.trend
                };
                
                if (vitals.glucose.value > 0) {
                  allGlucoseValuesRef.current.push(vitals.glucose.value);
                }
              }
              
              if (vitals.hemoglobin) {
                console.log(`Hemoglobin data received: ${vitals.hemoglobin.value} g/dL (confidence: ${vitals.hemoglobin.confidence}%)`);
                updated.hemoglobin = vitals.hemoglobin;
                allHemoglobinValuesRef.current.push(vitals.hemoglobin.value);
              }
              
              if (vitals.lastArrhythmiaData) {
                setLastArrhythmiaData(vitals.lastArrhythmiaData);
                updated.lastArrhythmiaData = vitals.lastArrhythmiaData;
                
                const [status, count] = vitals.arrhythmiaStatus.split('|');
                setArrhythmiaCount(count || "0");
              }

              if (vitals.cholesterol) {
                console.log(`Lipid data received: Total=${vitals.cholesterol.totalCholesterol}, HDL=${vitals.cholesterol.hdl}, LDL=${vitals.cholesterol.ldl}, TG=${vitals.cholesterol.triglycerides}`);
                updated.cholesterol = vitals.cholesterol;
              }
              
              if (vitals.lipids) {
                updated.lipids = vitals.lipids;
              }
              
              return updated;
            });
          
            setSignalQuality(lastSignal.quality);
          }
        }
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

  const updateVitals = (vitals: Partial<VitalSigns>) => {
    setVitalSigns(current => ({
      ...current,
      ...vitals
    }));
  };

  const processVitalSignsData = (data: any) => {
    const newVitals: Partial<VitalSigns> = {
      spo2: data.spo2,
      pressure: data.pressure,
      arrhythmiaStatus: data.arrhythmiaStatus,
      respiration: data.respiration,
      glucose: data.glucose,
      hemoglobin: data.hemoglobin,
      lastArrhythmiaData: data.lastArrhythmiaData,
      cholesterol: data.cholesterol
    };
    
    updateVitals(newVitals);
  };

  const resetVitals = () => {
    setVitalSigns(initialVitalSigns);
  };

  if (!hasPermissions) {
    return <PermissionsHandler 
      onPermissionsGranted={handlePermissionsGranted}
      onPermissionsDenied={handlePermissionsDenied}
    />;
  }

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100%',
        maxHeight: '100dvh',
        minHeight: '100vh',
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitOverflowScrolling: 'touch',
        overflow: 'hidden',
        paddingTop: 'var(--sat)',
        paddingRight: 'var(--sar)',
        paddingBottom: 'var(--sab)',
        paddingLeft: 'var(--sal)',
      }}
    >
      <PermissionsHandler 
        onPermissionsGranted={handlePermissionsGranted}
        onPermissionsDenied={handlePermissionsDenied}
      />
      
      <CameraView 
        onStreamReady={handleStreamReady}
        isMonitoring={isMonitoring}
        isFingerDetected={lastSignal?.fingerDetected}
        signalQuality={signalQuality}
      />
      
      <div className="absolute inset-0 z-10">
        <PPGSignalMeter 
          value={lastSignal?.filteredValue || 0}
          quality={signalQuality}
          isFingerDetected={lastSignal?.fingerDetected}
          onStartMeasurement={startMonitoring}
          onReset={stopMonitoring}
          arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
          rawArrhythmiaData={lastArrhythmiaData}
        />
      </div>
      
      <div className="absolute z-20" style={{ bottom: '70px', left: 0, right: 0, padding: '0 10px' }}>
        <div className="p-1 rounded-lg">
          <div className="grid grid-cols-3 gap-1" style={{ maxHeight: '35vh', overflow: 'auto' }}>
            <VitalSign 
              label="HEART RATE"
              value={heartRate || "--"}
              unit="BPM"
            />
            <VitalSign 
              label="SPO2"
              value={vitalSigns.spo2 || "--"}
              unit="%"
            />
            <VitalSign 
              label="BLOOD PRESSURE"
              value={vitalSigns.pressure}
              unit="mmHg"
            />
            <VitalSign 
              label="ARRHYTHMIAS"
              value={vitalSigns.arrhythmiaStatus}
              unit=""
            />
            <VitalSign 
              label="RESPIRATION"
              value={vitalSigns.hasRespirationData ? vitalSigns.respiration.rate : "--"}
              unit="RPM"
              secondaryValue={vitalSigns.hasRespirationData ? vitalSigns.respiration.depth : "--"}
              secondaryUnit="Depth"
            />
            <VitalSign 
              label="GLUCOSE"
              value={vitalSigns.glucose ? vitalSigns.glucose.value : "--"}
              unit="mg/dL"
              trend={vitalSigns.glucose ? vitalSigns.glucose.trend : "unknown"}
            />
            <VitalSign 
              label="HEMOGLOBIN"
              value={vitalSigns.hemoglobin ? vitalSigns.hemoglobin.value : "--"}
              unit="g/dL"
            />
            <VitalSign 
              label="CHOLESTEROL"
              value={vitalSigns.cholesterol ? vitalSigns.cholesterol.totalCholesterol || "--" : "--"}
              unit="mg/dL"
              cholesterolData={vitalSigns.cholesterol ? {
                hdl: vitalSigns.cholesterol.hdl,
                ldl: vitalSigns.cholesterol.ldl,
                triglycerides: vitalSigns.cholesterol.triglycerides,
                confidence: vitalSigns.cholesterol.confidence
              } : undefined}
            />
          </div>
        </div>
      </div>

      <div className="absolute z-50" style={{ bottom: 0, left: 0, right: 0, height: '55px' }}>
        <div className="grid grid-cols-2 gap-px w-full h-full">
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
    </div>
  );
};

export default Index;
