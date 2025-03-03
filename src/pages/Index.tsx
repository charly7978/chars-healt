
import React, { useState, useRef, useEffect, useCallback } from "react";
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
  glucose: number;
  glucoseTrend?: 'rising' | 'falling' | 'stable';
  glucoseConfidence?: number;
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
    glucose: 0
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
    glucose: number
  } | null>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  
  // Refs for measurement state management
  const measurementTimerRef = useRef<number | null>(null);
  const isStartingRef = useRef(false); // Prevent multiple rapid starts
  const isStoppingRef = useRef(false); // Prevent multiple rapid stops
  const lastMonitoringActionTimeRef = useRef(0); // Debounce monitoring state changes
  
  // Refs for data collection
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allSpo2ValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  const allRespirationRateValuesRef = useRef<number[]>([]);
  const allRespirationDepthValuesRef = useRef<number[]>([]);
  const allGlucoseValuesRef = useRef<number[]>([]);
  
  const hasValidValuesRef = useRef(false);
  
  // Hooks
  const { 
    startProcessing, 
    stopProcessing, 
    lastSignal, 
    processFrame,
    isProcessing
  } = useSignalProcessor();
  
  const { 
    processSignal: processHeartBeat, 
    reset: resetHeartBeat, 
    cleanMemory: cleanHeartBeatMemory
  } = useHeartBeatProcessor();
  
  const { 
    processSignal: processVitalSigns, 
    reset: resetVitalSigns,
    cleanMemory: cleanVitalSignsMemory
  } = useVitalSignsProcessor();

  // Permission handlers
  const handlePermissionsGranted = useCallback(() => {
    console.log("Permissions granted correctly");
    setPermissionsGranted(true);
  }, []);

  const handlePermissionsDenied = useCallback(() => {
    console.log("Permissions denied - limited functionality");
    setPermissionsGranted(false);
    toast.error("Permisos de cámara denegados. La aplicación no funcionará correctamente.", {
      duration: 5000,
    });
  }, []);

  // Calculate final values from collected data
  const calculateFinalValues = useCallback(() => {
    try {
      console.log("Calculating REAL AVERAGES with all captured values...");
      
      const validHeartRates = allHeartRateValuesRef.current.filter(v => v > 40 && v < 200);
      const validSpo2Values = allSpo2ValuesRef.current.filter(v => v >= 80 && v <= 100);
      const validSystolicValues = allSystolicValuesRef.current.filter(v => v >= 70 && v <= 200);
      const validDiastolicValues = allDiastolicValuesRef.current.filter(v => v >= 40 && v <= 120);
      const validRespRates = allRespirationRateValuesRef.current.filter(v => v >= 8 && v <= 30);
      const validRespDepths = allRespirationDepthValuesRef.current.filter(v => v > 0 && v <= 100);
      const validGlucoseValues = allGlucoseValuesRef.current.filter(v => v >= 70 && v <= 200);
      
      console.log("Accumulated values for averages:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length,
        respirationRates: validRespRates.length,
        respirationDepths: validRespDepths.length,
        glucoseValues: validGlucoseValues.length
      });
      
      let avgHeartRate = 0;
      let avgSpo2 = 0;
      let avgSystolic = 0;
      let avgDiastolic = 0;
      let avgRespRate = 0;
      let avgRespDepth = 0;
      let avgGlucose = 0;
      
      if (validHeartRates.length > 0) {
        avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
      } else {
        avgHeartRate = heartRate > 0 ? heartRate : 0;
      }
      
      if (validSpo2Values.length > 0) {
        avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
      } else {
        avgSpo2 = vitalSigns.spo2 > 0 ? vitalSigns.spo2 : 0;
      }
      
      let finalBPString = vitalSigns.pressure;
      if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
        avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
        avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
        finalBPString = `${avgSystolic}/${avgDiastolic}`;
      }

      if (validRespRates.length > 0) {
        avgRespRate = Math.round(validRespRates.reduce((a, b) => a + b, 0) / validRespRates.length);
      } else {
        avgRespRate = vitalSigns.respiration.rate > 0 ? vitalSigns.respiration.rate : 0;
      }
      
      if (validRespDepths.length > 0) {
        avgRespDepth = Math.round(validRespDepths.reduce((a, b) => a + b, 0) / validRespDepths.length);
      } else {
        avgRespDepth = vitalSigns.respiration.depth > 0 ? vitalSigns.respiration.depth : 0;
      }
      
      if (validGlucoseValues.length > 0) {
        avgGlucose = Math.round(validGlucoseValues.reduce((a, b) => a + b, 0) / validGlucoseValues.length);
      } else {
        avgGlucose = vitalSigns.glucose > 0 ? vitalSigns.glucose : 0;
      }
      
      console.log("REAL AVERAGES calculated:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString,
        respiration: { rate: avgRespRate, depth: avgRespDepth },
        glucose: avgGlucose
      });
      
      setFinalValues({
        heartRate: avgHeartRate > 0 ? avgHeartRate : heartRate > 0 ? heartRate : 0,
        spo2: avgSpo2 > 0 ? avgSpo2 : vitalSigns.spo2 > 0 ? vitalSigns.spo2 : 0,
        pressure: finalBPString !== "--/--" ? finalBPString : vitalSigns.pressure,
        respiration: {
          rate: avgRespRate > 0 ? avgRespRate : vitalSigns.respiration.rate,
          depth: avgRespDepth > 0 ? avgRespDepth : vitalSigns.respiration.depth,
          regularity: vitalSigns.respiration.regularity
        },
        glucose: avgGlucose > 0 ? avgGlucose : vitalSigns.glucose > 0 ? vitalSigns.glucose : 0
      });
        
      hasValidValuesRef.current = true;
      
      // Clear arrays to free memory
      allHeartRateValuesRef.current = [];
      allSpo2ValuesRef.current = [];
      allSystolicValuesRef.current = [];
      allDiastolicValuesRef.current = [];
      allRespirationRateValuesRef.current = [];
      allRespirationDepthValuesRef.current = [];
      allGlucoseValuesRef.current = [];
    } catch (error) {
      console.error("Error in calculateFinalValues:", error);
      // Fallback to current values
      setFinalValues({
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure,
        respiration: vitalSigns.respiration,
        glucose: vitalSigns.glucose
      });
      hasValidValuesRef.current = true;
    }
  }, [heartRate, vitalSigns]);

  // Reset processors without affecting the display
  const prepareProcessorsOnly = useCallback(() => {
    console.log("Preparing ONLY processors (displays intact)");
    
    setElapsedTime(0);
    
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  }, [resetHeartBeat, resetVitalSigns]);

  // Start monitoring with debounce protection
  const startMonitoring = useCallback(() => {
    const currentTime = Date.now();
    
    // Debounce to prevent rapid start/stop cycles
    if (currentTime - lastMonitoringActionTimeRef.current < 1000) {
      console.log("Action debounced - too soon after last action");
      return;
    }
    lastMonitoringActionTimeRef.current = currentTime;
    
    if (isStartingRef.current || isStoppingRef.current) {
      console.log("Already starting or stopping measurement, ignoring duplicate call");
      return;
    }
    
    if (!permissionsGranted) {
      console.log("Cannot start without permissions");
      toast.error("Se requieren permisos de cámara para iniciar.", {
        duration: 3000,
      });
      return;
    }
    
    if (isMonitoring) {
      console.log("Already monitoring, stopping instead");
      stopMonitoringOnly();
      return;
    }
    
    console.log("Starting new measurement");
    isStartingRef.current = true;
    
    // Clean memory and prepare processors
    cleanHeartBeatMemory();
    cleanVitalSignsMemory();
    prepareProcessorsOnly();
    
    // Reset data arrays
    allHeartRateValuesRef.current = [];
    allSpo2ValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
    
    // Clear any existing timers
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    // First start the camera
    setIsCameraOn(true);
    
    // Then after a brief delay, start processing and set monitoring state
    setTimeout(() => {
      startProcessing();
      
      // Wait for processing to initialize
      setTimeout(() => {
        setIsMonitoring(true);
        setElapsedTime(0);
        setMeasurementComplete(false);
        
        measurementTimerRef.current = window.setInterval(() => {
          setElapsedTime(prev => {
            if (prev >= 40) {
              stopMonitoringOnly();
              return 40;
            }
            return prev + 1;
          });
        }, 1000);
        
        isStartingRef.current = false;
        
        console.log("Measurement started successfully");
        toast.success("Medición iniciada. Mantenga su dedo sobre la cámara.", {
          duration: 3000,
        });
      }, 300);
    }, 300);
  }, [cleanHeartBeatMemory, cleanVitalSignsMemory, isMonitoring, permissionsGranted, prepareProcessorsOnly, startProcessing]);

  // Stop monitoring with debounce protection
  const stopMonitoringOnly = useCallback(() => {
    const currentTime = Date.now();
    
    // Debounce to prevent rapid start/stop cycles
    if (currentTime - lastMonitoringActionTimeRef.current < 1000) {
      console.log("Action debounced - too soon after last action");
      return;
    }
    lastMonitoringActionTimeRef.current = currentTime;
    
    if (isStoppingRef.current) {
      console.log("Already stopping measurement, ignoring duplicate call");
      return;
    }
    
    console.log("Stopping monitoring");
    isStoppingRef.current = true;
    
    // First set monitoring state to false
    setIsMonitoring(false);
    
    // Then, after a brief delay, stop everything else
    setTimeout(() => {
      setIsCameraOn(false);
      stopProcessing();
      setMeasurementComplete(true);
      
      // Evaluate risks
      try {
        if (heartRate > 0) {
          VitalSignsRisk.getBPMRisk(heartRate, true);
        }
      } catch (err) {
        console.error("Error evaluating BPM risk:", err);
      }
      
      try {
        if (vitalSigns.pressure !== "--/--" && vitalSigns.pressure !== "0/0") {
          VitalSignsRisk.getBPRisk(vitalSigns.pressure, true);
        }
      } catch (err) {
        console.error("Error evaluating BP risk:", err);
      }
      
      try {
        if (vitalSigns.spo2 > 0) {
          VitalSignsRisk.getSPO2Risk(vitalSigns.spo2, true);
        }
      } catch (err) {
        console.error("Error evaluating SPO2 risk:", err);
      }
      
      calculateFinalValues();
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      
      isStoppingRef.current = false;
      
      toast.info("Medición completada.", {
        duration: 3000,
      });
    }, 300);
  }, [calculateFinalValues, heartRate, stopProcessing, vitalSigns.pressure, vitalSigns.spo2]);

  // Complete reset of everything
  const handleReset = useCallback(() => {
    console.log("COMPLETE RESET requested");
    
    // Prevent resets during state transitions
    if (isStartingRef.current || isStoppingRef.current) {
      console.log("Cannot reset during startup/shutdown");
      return;
    }
    
    const currentTime = Date.now();
    if (currentTime - lastMonitoringActionTimeRef.current < 500) {
      console.log("Reset debounced - too soon after last action");
      return;
    }
    lastMonitoringActionTimeRef.current = currentTime;
    
    // Clear any existing timers
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    // Stop all monitoring and processing
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    // Reset all state
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: 0
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    setElapsedTime(0);
    setMeasurementComplete(false);
    setFinalValues(null);
    
    // Reset all processors
    cleanHeartBeatMemory();
    cleanVitalSignsMemory();
    VitalSignsRisk.resetHistory();
    
    hasValidValuesRef.current = false;
    
    // Clear all data arrays
    allHeartRateValuesRef.current = [];
    allSpo2ValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
    
    toast.info("Reiniciado completo", {
      duration: 2000,
    });
  }, [cleanHeartBeatMemory, cleanVitalSignsMemory, stopProcessing]);

  // Process frames from the camera
  const handleStreamReady = useCallback((stream: MediaStream) => {
    if (!isMonitoring || !isCameraOn) {
      console.log("Stream ready but not monitoring, ignoring");
      return;
    }
    
    console.log("Stream ready, starting frame processing");
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    if (isMonitoring && videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(err => console.error("Error activating flash:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("Could not get 2D context");
      return;
    }
    
    const processImage = async () => {
      if (!isMonitoring || !isCameraOn) return;
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        processFrame(imageData);
        
        if (isMonitoring && isCameraOn) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Error capturing frame:", error);
        if (isMonitoring && isCameraOn) {
          // Use setTimeout to avoid requesting too many frames on error
          setTimeout(() => {
            if (isMonitoring && isCameraOn) {
              requestAnimationFrame(processImage);
            }
          }, 100);
        }
      }
    };

    processImage();
    
    return () => {
      if (videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: false }]
        }).catch(err => console.error("Error deactivating flash:", err));
      }
    };
  }, [isMonitoring, isCameraOn, processFrame]);

  // Turn off the flashlight when not monitoring
  useEffect(() => {
    if (!isMonitoring && isCameraOn) {
      try {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then(stream => {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getCapabilities()?.torch) {
              videoTrack.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(err => console.error("Error deactivating flash:", err));
            }
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => console.error("Error trying to turn off flash:", err));
      } catch (err) {
        console.error("Error accessing camera to turn off flash:", err);
      }
    }
  }, [isMonitoring, isCameraOn]);

  // Attempts to enter immersive mode for better UX
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
    
    // Try again after a delay in case the first attempt fails
    const immersiveTimeout = setTimeout(() => {
      if (!document.fullscreenElement) {
        enterImmersiveMode();
      }
    }, 1000);

    const handleInteraction = () => {
      if (!document.fullscreenElement) {
        enterImmersiveMode();
      }
    };

    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction, { passive: true });

    return () => {
      clearTimeout(immersiveTimeout);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
    };
  }, []);

  // Process PPG signal to calculate vital signs
  useEffect(() => {
    if (!lastSignal || !isMonitoring) return;
    
    try {
      if (lastSignal.fingerDetected && isMonitoring) {
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
            
            if (vitals.hasRespirationData && vitals.respiration) {
              console.log("Processing respiration data:", vitals.respiration);
              setVitalSigns(current => ({
                ...current,
                respiration: vitals.respiration,
                hasRespirationData: true
              }));
              
              if (vitals.respiration.rate > 0) {
                allRespirationRateValuesRef.current.push(vitals.respiration.rate);
              }
              
              if (vitals.respiration.depth > 0) {
                allRespirationDepthValuesRef.current.push(vitals.respiration.depth);
              }
            }
            
            if (vitals.lastArrhythmiaData) {
              setLastArrhythmiaData(vitals.lastArrhythmiaData);
              
              const [status, count] = vitals.arrhythmiaStatus.split('|');
              setArrhythmiaCount(count || "0");
            }
            
            if (vitals.glucose > 0) {
              setVitalSigns(current => ({
                ...current,
                glucose: vitals.glucose,
                glucoseTrend: vitals.glucoseTrend,
                glucoseConfidence: vitals.glucoseConfidence
              }));
              allGlucoseValuesRef.current.push(vitals.glucose);
            }
          }
        }
        
        setSignalQuality(lastSignal.quality);
      } else if (!lastSignal.fingerDetected && isMonitoring) {
        // Only update glucose to show it's not available when finger is removed
        if (!measurementComplete) {
          setVitalSigns(current => ({
            ...current,
            glucose: 0
          }));
        }
      }
    } catch (error) {
      console.error("Error processing signal:", error);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, measurementComplete]);

  // Clean up resources when component unmounts
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
        />
      </div>
      
      {isMonitoring && (
        <div className="absolute z-30 text-sm bg-black/50 backdrop-blur-sm px-3 py-1 rounded-lg" 
          style={{ top: '35%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          <span className="text-cyan-400 font-medium">
            Respiración: {vitalSigns.hasRespirationData ? 
              `${vitalSigns.respiration.rate} RPM, Prof: ${vitalSigns.respiration.depth}%` : 
              'Calibrando...'} | Glucosa: {vitalSigns.glucose > 0 ? `${vitalSigns.glucose} mg/dL` : 'Calibrando...'}
          </span>
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
              value={finalValues ? finalValues.glucose : vitalSigns.glucose || "--"}
              unit="mg/dL"
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
            disabled={!permissionsGranted || isStartingRef.current || isStoppingRef.current}
            style={{ 
              backgroundImage: !permissionsGranted 
                ? 'linear-gradient(135deg, #64748b, #475569, #334155)'
                : isMonitoring 
                  ? 'linear-gradient(135deg, #f87171, #dc2626, #b91c1c)' 
                  : 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
              textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
              opacity: (!permissionsGranted || isStartingRef.current || isStoppingRef.current) ? 0.7 : 1
            }}
          >
            {!permissionsGranted ? 'PERMISOS REQUERIDOS' : (isMonitoring ? 'DETENER' : 'INICIAR')}
          </button>
          <button 
            onClick={handleReset}
            className="w-full h-full text-xl font-bold text-white transition-colors duration-200"
            disabled={isStartingRef.current || isStoppingRef.current}
            style={{ 
              backgroundImage: 'linear-gradient(135deg, #64748b, #475569, #334155)',
              textShadow: '0px 1px 3px rgba(0, 0, 0, 0.3)',
              opacity: (isStartingRef.current || isStoppingRef.current) ? 0.7 : 1
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
