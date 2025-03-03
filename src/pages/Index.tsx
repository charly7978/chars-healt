
import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';
import { CholesterolData } from "@/types/signal";

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
  };
  lipids: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  } | null;
  lastArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiration: { rate: 0, depth: 0, regularity: 0 },
    hasRespirationData: false,
    glucose: { value: 0, trend: 'unknown' },
    lipids: null,
    lastArrhythmiaData: null
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
    lipids: {
      totalCholesterol: number;
      hdl: number;
      ldl: number;
      triglycerides: number;
    } | null
  } | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const measurementTimerRef = useRef<number | null>(null);
  
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allSpo2ValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  const allRespirationRateValuesRef = useRef<number[]>([]);
  const allRespirationDepthValuesRef = useRef<number[]>([]);
  const allGlucoseValuesRef = useRef<number[]>([]);
  const allLipidValuesRef = useRef<{
    totalCholesterol: number[];
    hdl: number[];
    ldl: number[];
    triglycerides: number[];
  }>({
    totalCholesterol: [],
    hdl: [],
    ldl: [],
    triglycerides: []
  });
  
  const hasValidValuesRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
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
      const validLipidValues = allLipidValuesRef.current.totalCholesterol.filter(v => v > 0);
      
      console.log("Valores acumulados para promedios:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length,
        respirationRates: validRespRates.length,
        respirationDepths: validRespDepths.length,
        glucoseValues: validGlucoseValues.length,
        lipidValues: validLipidValues.length
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
      
      let finalLipids = null;
      if (allLipidValuesRef.current.totalCholesterol.length > 0) {
        const avgTotalCholesterol = Math.round(
          allLipidValuesRef.current.totalCholesterol.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.totalCholesterol.length
        );
        
        const avgHDL = Math.round(
          allLipidValuesRef.current.hdl.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.hdl.length
        );
        
        const avgLDL = Math.round(
          allLipidValuesRef.current.ldl.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.ldl.length
        );
        
        const avgTriglycerides = Math.round(
          allLipidValuesRef.current.triglycerides.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.triglycerides.length
        );
        
        finalLipids = {
          totalCholesterol: avgTotalCholesterol,
          hdl: avgHDL,
          ldl: avgLDL,
          triglycerides: avgTriglycerides
        };
      } else {
        finalLipids = vitalSigns.lipids;
      }
      
      console.log("PROMEDIOS REALES calculados:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString,
        respiration: { rate: avgRespRate, depth: avgRespDepth },
        glucose: avgGlucose,
        lipids: finalLipids
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
        lipids: finalLipids
      });
        
      hasValidValuesRef.current = true;
      
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
      allRespirationRateValuesRef.current = [];
      allRespirationDepthValuesRef.current = [];
      allGlucoseValuesRef.current = [];
      allLipidValuesRef.current = {
        totalCholesterol: [],
        hdl: [],
        ldl: [],
        triglycerides: []
      };
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      setFinalValues({
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure,
        respiration: vitalSigns.respiration,
        glucose: vitalSigns.glucose,
        lipids: vitalSigns.lipids
      });
      hasValidValuesRef.current = true;
    }
  };

  const startMonitoring = () => {
    if (!permissionsGranted) {
      console.log("No se puede iniciar sin permisos");
      return;
    }
    
    if (!isMonitoring && lastSignal?.quality < 50) {
      console.log("Señal insuficiente para iniciar medición", lastSignal?.quality);
      return;
    }
    
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
      allRespirationRateValuesRef.current = [];
      allRespirationDepthValuesRef.current = [];
      allGlucoseValuesRef.current = [];
      allLipidValuesRef.current = {
        totalCholesterol: [],
        hdl: [],
        ldl: [],
        triglycerides: []
      };
      
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
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: { value: 0, trend: 'unknown' },
      lipids: null,
      lastArrhythmiaData: null
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
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
    allLipidValuesRef.current = {
      totalCholesterol: [],
      hdl: [],
      ldl: [],
      triglycerides: []
    };
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
          
          const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            console.log("Raw vital signs data:", JSON.stringify(vitals));
            
            if (vitals.spo2 > 0) {
              setVitalSigns(current => ({
                ...current,
                spo2: vitals.spo2,
                lipids: current.lipids,
              }));
              allSpo2ValuesRef.current.push(vitals.spo2);
            }
            
            if (vitals.pressure !== "--/--" && vitals.pressure !== "0/0") {
              setVitalSigns(current => ({
                ...current,
                pressure: vitals.pressure,
                lipids: current.lipids,
              }));
              
              const [systolic, diastolic] = vitals.pressure.split('/').map(Number);
              if (systolic > 0 && diastolic > 0) {
                allSystolicValuesRef.current.push(systolic);
                allDiastolicValuesRef.current.push(diastolic);
              }
            }
            
            setVitalSigns(current => ({
              ...current,
              arrhythmiaStatus: vitals.arrhythmiaStatus,
              lipids: current.lipids,
            }));
            
            if (vitals.hasRespirationData && vitals.respiration) {
              console.log("Procesando datos de respiración:", vitals.respiration);
              setVitalSigns(current => ({
                ...current,
                respiration: vitals.respiration,
                hasRespirationData: true,
                lipids: current.lipids,
              }));
              
              if (vitals.respiration.rate > 0) {
                allRespirationRateValuesRef.current.push(vitals.respiration.rate);
              }
              
              if (vitals.respiration.depth > 0) {
                allRespirationDepthValuesRef.current.push(vitals.respiration.depth);
              }
            }
            
            console.log("Glucose data from vitals:", vitals.glucose ? 
              `${vitals.glucose.value} mg/dL (${vitals.glucose.trend})` : 
              'No hay datos de glucosa');
            
            if (vitals.glucose && vitals.glucose.value > 0) {
              console.log("Actualizando UI con datos de glucosa:", vitals.glucose);
              setVitalSigns(current => ({
                ...current,
                glucose: vitals.glucose,
                lipids: current.lipids,
              }));
              
              allGlucoseValuesRef.current.push(vitals.glucose.value);
            }
            
            if (vitals.lipids) {
              console.log("Actualizando UI con datos de lípidos:", vitals.lipids);
              setVitalSigns(current => ({
                ...current,
                lipids: vitals.lipids
              }));
              
              if (vitals.lipids.totalCholesterol > 0) {
                allLipidValuesRef.current.totalCholesterol.push(vitals.lipids.totalCholesterol);
              }
              if (vitals.lipids.hdl > 0) {
                allLipidValuesRef.current.hdl.push(vitals.lipids.hdl);
              }
              if (vitals.lipids.ldl > 0) {
                allLipidValuesRef.current.ldl.push(vitals.lipids.ldl);
              }
              if (vitals.lipids.triglycerides > 0) {
                allLipidValuesRef.current.triglycerides.push(vitals.lipids.triglycerides);
              }
            }
            
            if (vitals.lastArrhythmiaData) {
              setLastArrhythmiaData(vitals.lastArrhythmiaData);
              setVitalSigns(current => ({
                ...current,
                lastArrhythmiaData: vitals.lastArrhythmiaData,
                lipids: current.lipids,
              }));
              
              const [status, count] = vitals.arrhythmiaStatus.split('|');
              setArrhythmiaCount(count || "0");
            }
          }
        
          setSignalQuality(lastSignal.quality);
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
      
      <div className="absolute inset-0 z-0">
        <CameraView 
          onStreamReady={handleStreamReady}
          isMonitoring={isCameraOn && permissionsGranted}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
          signalQuality={isMonitoring ? signalQuality : 0}
        />
        <div 
          className="absolute inset-0" 
          style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.8)', 
            backdropFilter: 'blur(2px)' 
          }} 
        />
      </div>

      <div className="absolute inset-0 z-10">
        <PPGSignalMeter 
          value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
          quality={isMonitoring ? lastSignal?.quality || 0 : 0}
          isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
          onStartMeasurement={startMonitoring}
          onReset={handleReset}
          arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
          rawArrhythmiaData={lastArrhythmiaData}
          lipidData={vitalSigns.lipids}
        />
      </div>
      
      <div className="absolute z-20" style={{ bottom: '55px', left: 0, right: 0, padding: '0 8px' }}>
        <div className="p-1 rounded-lg">
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
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
            <VitalSign 
              label="GLUCOSA"
              value={finalValues ? finalValues.glucose.value : vitalSigns.glucose.value || "--"}
              unit="mg/dL"
              trend={finalValues ? finalValues.glucose.trend : vitalSigns.glucose.trend}
              isFinalReading={measurementComplete}
            />
            <VitalSign 
              label="LÍPIDOS"
              value={vitalSigns.lipids ? vitalSigns.lipids.totalCholesterol : "--"}
              unit="mg/dL"
              secondaryValue={vitalSigns.lipids ? `HDL: ${vitalSigns.lipids.hdl}` : "--"}
              isFinalReading={measurementComplete}
            />
          </div>
        </div>
      </div>

      <div className="absolute z-50" style={{ bottom: 0, left: 0, right: 0, height: '45px' }}>
        <div className="grid grid-cols-2 gap-px w-full h-full">
          <button 
            onClick={startMonitoring}
            className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
            disabled={!permissionsGranted}
            style={{ 
              backgroundImage: !permissionsGranted 
                ? 'linear-gradient(135deg, #64748b, #475569, #334155)'
                : isMonitoring 
                  ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
                  : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
              textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
              opacity: !permissionsGranted ? 0.7 : 1
            }}
          >
            {!permissionsGranted ? 'PERMISOS REQUERIDOS' : (isMonitoring ? 'DETENER' : 'INICIAR')}
          </button>
          <button 
            onClick={handleReset}
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
      
      {!permissionsGranted && (
        <div className="absolute z-50 top-1/2 left-0 right-0 text-center px-4 transform -translate-y-1/2">
          <div className="bg-red-900/80 backdrop-blur-sm p-4 rounded-lg mx-auto max-w-md">
            <h3 className="text-xl font-bold text-white mb-2">Permisos necesarios</h3>
            <p className="text-white/90 mb-4">
              Esta aplicación necesita acceso a la cámara para medir tus signos vitales.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-red-900 font-bold py-2 px-4 rounded"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
