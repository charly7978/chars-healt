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
  heartRate: number;
  spo2: number;
  pressure: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
    pattern?: string;
    confidence?: number;
  };
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  };
  hasGlucoseData: boolean;
  hasRespirationData: boolean;
  arrhythmiaStatus: string;
  arrhythmiaCount: number;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
    prematureBeat: boolean;
    confidence: number;
  };
}

const initialVitalSigns: VitalSigns = {
  heartRate: 0,
  spo2: 0,
  pressure: '--/--',
  respiration: {
    rate: 0,
    depth: 0,
    regularity: 0
  },
  glucose: {
    value: 0,
    trend: 'unknown'
  },
  hasGlucoseData: false,
  hasRespirationData: false,
  arrhythmiaStatus: '--',
  arrhythmiaCount: 0
};

interface RealTimeValues {
  heartRate: number;
  spo2: number;
  pressure: string;
  respiratoryRate: number;
  arrhythmiaStatus: string;
}

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    heartRate: 0,
    spo2: 98,
    pressure: '0/0',
    respiration: {
      rate: 0,
      depth: 0,
      regularity: 0,
      pattern: 'normal',
      confidence: 0
    },
    glucose: {
      value: 0,
      trend: 'unknown'
    },
    hasGlucoseData: false,
    hasRespirationData: false,
    arrhythmiaStatus: 'normal',
    arrhythmiaCount: 0,
    lastArrhythmiaData: {
      timestamp: Date.now(),
      rmssd: 0,
      rrVariation: 0,
      prematureBeat: false,
      confidence: 0
    }
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
  const [finalValues, setFinalValues] = useState<VitalSigns | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const measurementTimerRef = useRef<number | null>(null);
  
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allOxygenValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  const allRespirationRateValuesRef = useRef<number[]>([]);
  const allRespirationDepthValuesRef = useRef<number[]>([]);
  const allGlucoseValuesRef = useRef<number[]>([]);
  
  const hasValidValuesRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { vitalSignsData, processSignal, reset, getCurrentRespiratoryData, getArrhythmiaData } = useVitalSignsProcessor();

  // Estados
  const [permissionsState, setPermissionsState] = useState<'initial' | 'granted' | 'denied'>('initial');
  const [isFingerDetected, setIsFingerDetected] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  
  // Añade el estado realTimeValues
  const [realTimeValues, setRealTimeValues] = useState<RealTimeValues>({
    heartRate: 0,
    spo2: 98,
    pressure: '0/0',
    respiratoryRate: 0,
    arrhythmiaStatus: 'normal'
  });

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
  };

  const calculateFinalValues = () => {
    if (!vitalSigns) return;

    // Validar y preparar valores seguros
    const safeHeartRate = vitalSigns.heartRate || 0;
    const safeSpo2 = vitalSigns.spo2 || 98;
    const safePressure = vitalSigns.pressure || '0/0';
    
    // Calcular valores basados en el historial
    let averageHeartRate = 0;
    if (allHeartRateValuesRef.current.length > 0) {
      const sum = allHeartRateValuesRef.current.reduce((a, b) => a + b, 0);
      averageHeartRate = Math.round(sum / allHeartRateValuesRef.current.length);
    }
    
    let averageSpo2 = 98;
    if (allOxygenValuesRef.current.length > 0) {
      const sum = allOxygenValuesRef.current.reduce((a, b) => a + b, 0);
      averageSpo2 = Math.round(sum / allOxygenValuesRef.current.length);
    }
    
    let calculatedPressure = safePressure;
    if (allSystolicValuesRef.current.length > 0 && allDiastolicValuesRef.current.length > 0) {
      const sumSystolic = allSystolicValuesRef.current.reduce((a, b) => a + b, 0);
      const sumDiastolic = allDiastolicValuesRef.current.reduce((a, b) => a + b, 0);
      const avgSystolic = Math.round(sumSystolic / allSystolicValuesRef.current.length);
      const avgDiastolic = Math.round(sumDiastolic / allDiastolicValuesRef.current.length);
      calculatedPressure = `${avgSystolic}/${avgDiastolic}`;
    }
    
    // Manejar datos de respiración
    let respirationData = {
      rate: 0,
      depth: 0,
      regularity: 0,
      pattern: 'normal' as string,
      confidence: 0 as number
    };
    
    if (vitalSigns.hasRespirationData && vitalSigns.respiration) {
      respirationData = {
        rate: vitalSigns.respiration.rate || 0,
        depth: vitalSigns.respiration.depth || 0,
        regularity: vitalSigns.respiration.regularity || 0,
        pattern: vitalSigns.respiration.pattern || 'normal',
        confidence: vitalSigns.respiration.confidence || 0
      };
      
      // Calcular promedio si hay datos históricos
      if (allRespirationRateValuesRef.current.length > 0) {
        respirationData.rate = allRespirationRateValuesRef.current.reduce((a, b) => a + b, 0) / 
          allRespirationRateValuesRef.current.length;
      }
    }
    
    // Manejar datos de glucosa
    let glucoseData = {
      value: 0,
      trend: 'unknown' as 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown'
    };
    let hasGlucoseData = false;
    
    if (vitalSigns.hasGlucoseData && vitalSigns.glucose) {
      glucoseData = vitalSigns.glucose;
      hasGlucoseData = true;
      
      // Calcular tendencia basada en más datos históricos si están disponibles
      if (allGlucoseValuesRef.current.length > 5) {
        const recentValues = allGlucoseValuesRef.current.slice(-5);
        const avgChange = (recentValues[4] - recentValues[0]) / 4;
        
        if (Math.abs(avgChange) < 2) glucoseData.trend = 'stable';
        else if (avgChange > 15) glucoseData.trend = 'rising_rapidly';
        else if (avgChange > 5) glucoseData.trend = 'rising';
        else if (avgChange < -15) glucoseData.trend = 'falling_rapidly';
        else if (avgChange < -5) glucoseData.trend = 'falling';
      }
    }
    
    // Manejar datos de arritmia
    const arrhythmiaStatus = vitalSigns.arrhythmiaStatus || 'normal';
    const arrhythmiaCount = vitalSigns.arrhythmiaCount || 0;
    
    // Actualizar el estado con todos los valores calculados
    setVitalSigns({
      heartRate: averageHeartRate || safeHeartRate,
      spo2: averageSpo2,
      pressure: calculatedPressure,
      respiration: respirationData,
      glucose: glucoseData,
      hasGlucoseData,
      hasRespirationData: vitalSigns.hasRespirationData,
      arrhythmiaStatus,
      arrhythmiaCount,
      lastArrhythmiaData: vitalSigns.lastArrhythmiaData
    });
    
    // Actualizar valores en tiempo real también para mantener coherencia
    setRealTimeValues({
      heartRate: safeHeartRate,
      spo2: safeSpo2,
      pressure: safePressure,
      respiratoryRate: respirationData.rate,
      arrhythmiaStatus
    });
  };

  const startMonitoring = () => {
    if (!permissionsGranted) {
      console.log("No se puede iniciar sin permisos");
      return;
    }
    
    if (!isMonitoring && lastSignal?.quality < 50) {
      console.log("Señal insuficiente para iniciar medición", lastSignal?.quality);
      toast.warning("Calidad de señal insuficiente. Posicione bien su dedo en la cámara.", {
        duration: 3000,
      });
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
      allOxygenValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
      allRespirationRateValuesRef.current = [];
      allRespirationDepthValuesRef.current = [];
      allGlucoseValuesRef.current = [];
      
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
    reset();
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
      ...vitalSigns,
      heartRate: 0,
      spo2: 0, 
      pressure: '--/--',
      respiration: {
        rate: 0,
        depth: 0,
        regularity: 0
      },
      glucose: {
        value: 0,
        trend: 'unknown'
      },
      hasGlucoseData: false,
      hasRespirationData: false,
      arrhythmiaStatus: '--',
      arrhythmiaCount: 0
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    setElapsedTime(0);
    setMeasurementComplete(false);
    setFinalValues(null);
    
    resetHeartBeat();
    reset();
    VitalSignsRisk.resetHistory();
    
    hasValidValuesRef.current = false;
    
    allHeartRateValuesRef.current = [];
    allOxygenValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    if (isMonitoring && videoTrack.getCapabilities()?.torch) {
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
    
    return () => {
      if (videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: false }]
        }).catch(err => console.error("Error desactivando linterna:", err));
      }
    };
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
          
          const vitals = processSignal(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            // Actualizar todos los valores en una sola operación
            setVitalSigns({
              ...vitalSigns,
              spo2: vitals.spo2 > 0 ? vitals.spo2 : vitalSigns.spo2,
              pressure: (vitals.pressure && vitals.pressure !== '0/0') ? vitals.pressure : vitalSigns.pressure,
              arrhythmiaStatus: vitals.arrhythmiaStatus || vitalSigns.arrhythmiaStatus,
              arrhythmiaCount: vitals.arrhythmiaStatus?.includes('|') 
                ? parseInt(vitals.arrhythmiaStatus.split('|')[1]) || 0 
                : vitalSigns.arrhythmiaCount
            });
            
            // Actualizar arrays de referencia
            if (vitals.spo2 > 0) allOxygenValuesRef.current.push(vitals.spo2);
            if (vitals.pressure && vitals.pressure !== '0/0') allSystolicValuesRef.current.push(parseInt(vitals.pressure.split('/')[0]));
            if (vitals.pressure && vitals.pressure !== '0/0') allDiastolicValuesRef.current.push(parseInt(vitals.pressure.split('/')[1]));
            if (vitals.respiratoryRate > 0) allRespirationRateValuesRef.current.push(vitals.respiratoryRate);
            if (vitals.respiratoryPattern && vitals.respiratoryConfidence > 0) {
              const derivedDepth = vitals.respiratoryConfidence / 100 * (vitals.respiratoryPattern === 'deep' ? 0.8 : 0.5);
              allRespirationDepthValuesRef.current.push(derivedDepth);
            }
            if (vitals.glucose && vitals.glucose.value > 0) {
              setVitalSigns(prevState => ({
                ...prevState,
                glucose: {
                  value: vitals.glucose.value,
                  trend: vitals.glucose.trend || 'unknown'
                },
                hasGlucoseData: true
              }));
              allGlucoseValuesRef.current.push(vitals.glucose.value);
            }
            
            // Actualizar datos de arritmia
            if (vitals.arrhythmiaStatus) {
              setVitalSigns(prevState => ({
                ...prevState,
                arrhythmiaStatus: vitals.arrhythmiaStatus || 'normal',
                arrhythmiaCount: (prevState.arrhythmiaCount || 0) + (vitals.arrhythmiaStatus !== 'normal' ? 1 : 0)
              }));
                
              if (vitals.arrhythmiaStatus !== 'normal' && vitals.lastArrhythmiaData) {
                console.log('Arritmia detectada:', {
                  status: vitals.arrhythmiaStatus,
                  data: vitals.lastArrhythmiaData
                });
              }
            }
          }
          
          setSignalQuality(lastSignal.quality);
        }
      } catch (error) {
        console.error("Error procesando señal:", error);
      }
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processSignal, measurementComplete]);

  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);

  const handleVitalSignsUpdate = (vitals: any) => {
    if (vitals) {
      // Actualizar los valores en tiempo real
      setRealTimeValues({
        heartRate: vitals.heartRate || 0,
        spo2: vitals.spo2 || 98,
        pressure: vitals.pressure || '0/0',
        respiratoryRate: vitals.respiratoryRate || 0,
        arrhythmiaStatus: vitals.arrhythmiaStatus || 'normal'
      });

      // Guardar historial para tendencias y promedios
      if (vitals.heartRate > 0) allHeartRateValuesRef.current.push(vitals.heartRate);
      if (vitals.spo2 > 0) allOxygenValuesRef.current.push(vitals.spo2);
      
      if (vitals.pressure && vitals.pressure !== '0/0') {
        const parts = vitals.pressure.split('/');
        if (parts.length === 2) {
          allSystolicValuesRef.current.push(parseInt(parts[0]));
          allDiastolicValuesRef.current.push(parseInt(parts[1]));
        }
      }
      
      if (vitals.respiratoryRate > 0) {
        allRespirationRateValuesRef.current.push(vitals.respiratoryRate);
        
        // Crear un objeto de respiración completo para el estado
        setVitalSigns(prevState => ({
          ...prevState,
          respiration: {
            rate: vitals.respiratoryRate,
            depth: prevState.respiration?.depth || 0.5,
            regularity: prevState.respiration?.regularity || 0.7,
            pattern: vitals.respiratoryPattern || 'normal',
            confidence: vitals.respiratoryConfidence || 50
          },
          hasRespirationData: true
        }));
      }
      
      // Manejar datos de glucosa desde sessionStorage, no desde vitals
      const glucoseFromSession = sessionStorage.getItem('lastGlucoseValue');
      if (glucoseFromSession) {
        const glucoseValue = parseFloat(glucoseFromSession);
        if (!isNaN(glucoseValue) && glucoseValue > 0) {
          let trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' = 'unknown';
          
          // Determinar tendencia basada en valores históricos
          if (allGlucoseValuesRef.current.length > 2) {
            const recentValues = allGlucoseValuesRef.current.slice(-3);
            const avgChange = (recentValues[2] - recentValues[0]) / 2;
            
            if (Math.abs(avgChange) < 2) trend = 'stable';
            else if (avgChange > 15) trend = 'rising_rapidly';
            else if (avgChange > 5) trend = 'rising';
            else if (avgChange < -15) trend = 'falling_rapidly';
            else if (avgChange < -5) trend = 'falling';
          }
          
          setVitalSigns(prevState => ({
            ...prevState,
            glucose: {
              value: glucoseValue,
              trend: trend
            },
            hasGlucoseData: true
          }));
          
          allGlucoseValuesRef.current.push(glucoseValue);
        }
      }
              
      // Actualizar datos de arritmia
      if (vitals.arrhythmiaStatus) {
        setVitalSigns(prevState => ({
          ...prevState,
          arrhythmiaStatus: vitals.arrhythmiaStatus,
          arrhythmiaCount: (prevState.arrhythmiaCount || 0) + (vitals.arrhythmiaStatus !== 'normal' ? 1 : 0),
          lastArrhythmiaData: vitals.lastArrhythmiaData || prevState.lastArrhythmiaData
        }));
        
        if (vitals.arrhythmiaStatus !== 'normal' && vitals.lastArrhythmiaData) {
          console.log('Arritmia detectada:', {
            status: vitals.arrhythmiaStatus,
            data: vitals.lastArrhythmiaData
          });
        }
      }
    }
  };

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
        />
      </div>
      
      {isMonitoring && (
        <div className="absolute z-30 text-sm bg-black/50 backdrop-blur-sm px-3 py-1 rounded-lg" 
          style={{ top: '35%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <span className="text-cyan-400 font-medium">Respiración: {vitalSigns.hasRespirationData ? 
            `${vitalSigns.respiration.rate} RPM, Profundidad: ${vitalSigns.respiration.depth}%` : 
            'Calibrando...'}</span>
        </div>
      )}

      <div className="absolute z-20" style={{ bottom: '65px', left: 0, right: 0, padding: '0 12px' }}>
        <div className="p-2 rounded-lg">
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
              label="RESPIRACIÓN"
              value={finalValues ? finalValues.respiration.rate : (vitalSigns.hasRespirationData ? vitalSigns.respiration.rate : "--")}
              unit="RPM"
              secondaryValue={finalValues ? finalValues.respiration.depth : (vitalSigns.hasRespirationData ? vitalSigns.respiration.depth : "--")}
              secondaryUnit="%"
              isFinalReading={measurementComplete}
            />
            <VitalSign 
              label="GLUCOSA"
              value={finalValues ? finalValues.glucose.value : vitalSigns.glucose.value || "--"}
              unit="mg/dL"
              trend={finalValues ? finalValues.glucose.trend : vitalSigns.glucose.trend}
              isFinalReading={measurementComplete}
            />
          </div>
        </div>
      </div>

      <div className="absolute z-50" style={{ bottom: 0, left: 0, right: 0, height: '55px' }}>
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
