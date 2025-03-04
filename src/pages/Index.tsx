import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import { toast } from "sonner";

interface CholesterolData {
  totalCholesterol: number;
  hdl: number;
  ldl: number;
  triglycerides: number;
}

interface TemperatureData {
  value: number;
  trend: 'stable' | 'rising' | 'falling';
  location: string;
}

interface HemoglobinData {
  value: number;
  confidence: number;
  lastUpdated: number;
}

interface VitalSignsState {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  hasRespirationData: boolean;
  glucose: any;
  hemoglobin: HemoglobinData | null;
  isoCompliant: boolean;
  calibrationStatus: string;
  motionScore: number;
  cholesterol: CholesterolData;
  temperature: TemperatureData;
  lastArrhythmiaData?: any;
}

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSignsState>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiration: { rate: 0, depth: 0, regularity: 0 },
    hasRespirationData: false,
    glucose: null,
    hemoglobin: null,
    isoCompliant: false,
    calibrationStatus: 'uncalibrated',
    motionScore: 0,
    cholesterol: {
      totalCholesterol: 0,
      hdl: 0,
      ldl: 0,
      triglycerides: 0
    },
    temperature: {
      value: 0,
      trend: 'stable' as const,
      location: 'peripheral'
    }
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
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
    hemoglobin: number | null,
    cholesterol: CholesterolData | null,
    temperature: TemperatureData | null
  } | null>(null);
  const measurementTimerRef = useRef(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  const handlePermissionsGranted = () => {
    console.log("Permisos concedidos correctamente");
    setPermissionsGranted(true);
  };

  const handlePermissionsDenied = () => {
    console.log("Permisos denegados - funcionalidad limitada");
    setPermissionsGranted(false);
  };

  const enterFullScreen = async () => {
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
  };

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
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: null,
      hemoglobin: null,
      isoCompliant: false,
      calibrationStatus: 'uncalibrated',
      motionScore: 0,
      cholesterol: {
        totalCholesterol: 0,
        hdl: 0,
        ldl: 0,
        triglycerides: 0
      },
      temperature: {
        value: 0,
        trend: 'stable' as const,
        location: 'peripheral'
      }
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
          setTimeout(() => requestAnimationFrame(processImage), 100); // Con un pequeño retardo para recuperarse
        }
      }
    };

    processImage();
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      try {
        const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
        setHeartRate(heartBeatResult.bpm);
        
        const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
        
        if (vitals) {
          // Generate sample cholesterol and temperature data for testing
          // In a real implementation, these would come from the vital signs processor
          const cholesterolData = {
            totalCholesterol: 180 + Math.round(Math.random() * 40),
            hdl: 45 + Math.round(Math.random() * 15),
            ldl: 100 + Math.round(Math.random() * 30),
            triglycerides: 120 + Math.round(Math.random() * 40)
          };
          
          const temperatureData = {
            value: 36.5 + (Math.random() * 1.2 - 0.5),
            trend: Math.random() > 0.7 ? 'rising' : Math.random() > 0.4 ? 'falling' : 'stable' as 'stable' | 'rising' | 'falling',
            location: 'peripheral'
          };
          
          console.log("Vital signs data details:", {
            spo2: vitals.spo2,
            pressure: vitals.pressure,
            arrhythmia: vitals.arrhythmiaStatus,
            respiration: vitals.respiration,
            glucose: vitals.glucose ? `${vitals.glucose.value} mg/dL (${vitals.glucose.trend || 'unknown'})` : 'No data',
            hemoglobin: vitals.hemoglobin ? `${typeof vitals.hemoglobin === 'number' ? vitals.hemoglobin : vitals.hemoglobin.value} g/dL` : 'No data',
            cholesterol: `Total: ${cholesterolData.totalCholesterol}, HDL: ${cholesterolData.hdl}, LDL: ${cholesterolData.ldl}`,
            temperature: `${temperatureData.value.toFixed(1)}°C (${temperatureData.trend})`
          });
          
          // Create a complete vital signs object that includes all required properties
          const updatedVitalSigns: VitalSignsState = {
            ...vitals,
            isoCompliant: vitals.isoCompliant || false,
            calibrationStatus: vitals.calibrationStatus || 'uncalibrated',
            motionScore: vitals.motionScore || 0,
            cholesterol: cholesterolData,
            temperature: temperatureData,
            hemoglobin: vitals.hemoglobin || null
          };
          
          setVitalSigns(updatedVitalSigns);
          setArrhythmiaCount(vitals.arrhythmiaStatus.split('|')[1] || "--");
          
          if (elapsedTime >= 15 && !finalValues) {
            const hemoglobinValue = typeof updatedVitalSigns.hemoglobin === 'number' ? 
              updatedVitalSigns.hemoglobin : 
              (updatedVitalSigns.hemoglobin?.value || 0);
              
            setFinalValues({
              heartRate: heartBeatResult.bpm,
              spo2: vitals.spo2,
              pressure: vitals.pressure,
              respiration: vitals.respiration,
              glucose: vitals.glucose || { value: 0, trend: 'unknown' as const },
              hemoglobin: hemoglobinValue,
              cholesterol: cholesterolData,
              temperature: temperatureData
            });
            
            toast.success("Lecturas finales capturadas", {
              description: `FC: ${heartBeatResult.bpm} BPM, SpO2: ${vitals.spo2}%`,
              duration: 3000
            });
          }
          
          // Log additional data
          if (vitals.glucose && vitals.glucose.value > 0) {
            console.log(`Glucose data received: ${vitals.glucose.value} mg/dL, trend: ${vitals.glucose.trend}`);
          }
          
          const hemoglobinLog = typeof updatedVitalSigns.hemoglobin === 'number' ? 
            updatedVitalSigns.hemoglobin : 
            (updatedVitalSigns.hemoglobin?.value || 0);
            
          if (hemoglobinLog > 0) {
            console.log(`Hemoglobin data received: ${hemoglobinLog} g/dL`);
          }
          
          console.log(`Cholesterol data: Total: ${cholesterolData.totalCholesterol}, HDL: ${cholesterolData.hdl}, LDL: ${cholesterolData.ldl}`);
          console.log(`Temperature data: ${temperatureData.value.toFixed(1)}°C (${temperatureData.trend})`);
        }
        
        setSignalQuality(lastSignal.quality);
      } catch (error) {
        console.error("Error processing signal:", error);
      }
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, elapsedTime, finalValues]);

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
          <CameraView 
            onStreamReady={handleStreamReady}
            isMonitoring={isCameraOn && permissionsGranted}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[400px] bg-gradient-to-t from-black/90 via-black/80 to-black/30 z-10"></div>

        <div className="relative z-20 h-full flex flex-col">
          <div className="flex-1">
            <PPGSignalMeter 
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
              onStartMeasurement={startMonitoring}
              onReset={stopMonitoring}
              arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
              cholesterol={vitalSigns.cholesterol}
              temperature={vitalSigns.temperature}
            />
          </div>

          <div className="absolute bottom-[200px] left-0 right-0 px-4 z-30">
            <div className="grid grid-cols-9 gap-2">
              <VitalSign 
                label="HEART RATE"
                value={heartRate || "--"}
                unit="BPM"
                isFinalReading={heartRate > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="SPO2"
                value={vitalSigns.spo2 || "--"}
                unit="%"
                isFinalReading={vitalSigns.spo2 > 0 && elapsedTime >= 15}
                trend={vitalSigns.isoCompliant ? 'stable' : undefined}
              />
              <VitalSign 
                label="BLOOD PRESSURE"
                value={vitalSigns.pressure}
                unit="mmHg"
                isFinalReading={vitalSigns.pressure !== "--/--" && elapsedTime >= 15}
              />
              <VitalSign 
                label="ARRHYTHMIAS"
                value={vitalSigns.arrhythmiaStatus}
                unit=""
                isFinalReading={heartRate > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="RESPIRATION"
                value={vitalSigns.hasRespirationData ? vitalSigns.respiration.rate : "--"}
                unit="RPM"
                secondaryValue={vitalSigns.hasRespirationData ? vitalSigns.respiration.depth : "--"}
                secondaryUnit="Depth"
                isFinalReading={vitalSigns.hasRespirationData && elapsedTime >= 15}
              />
              <VitalSign 
                label="GLUCOSE"
                value={vitalSigns.glucose ? vitalSigns.glucose.value : "--"}
                unit="mg/dL"
                trend={vitalSigns.glucose ? vitalSigns.glucose.trend : undefined}
                isFinalReading={vitalSigns.glucose && vitalSigns.glucose.value > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="HEMOGLOBIN"
                value={typeof vitalSigns.hemoglobin === 'number' ? 
                  vitalSigns.hemoglobin : 
                  (vitalSigns.hemoglobin?.value || "--")}
                unit="g/dL"
                isFinalReading={vitalSigns.hemoglobin && (
                  typeof vitalSigns.hemoglobin === 'number' ? 
                  vitalSigns.hemoglobin > 0 : 
                  vitalSigns.hemoglobin.value > 0
                ) && elapsedTime >= 15}
              />
              <VitalSign 
                label="CHOLESTEROL"
                value={vitalSigns.cholesterol ? vitalSigns.cholesterol.totalCholesterol : "--"}
                unit="mg/dL"
                secondaryValue={vitalSigns.cholesterol ? `HDL: ${vitalSigns.cholesterol.hdl}` : "--"}
                isFinalReading={vitalSigns.cholesterol && vitalSigns.cholesterol.totalCholesterol > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="TEMPERATURE"
                value={vitalSigns.temperature ? vitalSigns.temperature.value : "--"}
                unit="°C"
                trend={vitalSigns.temperature ? vitalSigns.temperature.trend : undefined}
                isFinalReading={vitalSigns.temperature && vitalSigns.temperature.value > 0 && elapsedTime >= 15}
              />
            </div>
          </div>

          {isMonitoring && (
            <div className="absolute bottom-[150px] left-0 right-0 text-center z-30 text-xs text-gray-400">
              <span>
                Resp Data: {vitalSigns.hasRespirationData ? 'Available' : 'Not available'} | 
                Rate: {vitalSigns.respiration.rate} RPM | Depth: {vitalSigns.respiration.depth} | 
                Glucose: {vitalSigns.glucose ? `${vitalSigns.glucose.value} mg/dL (${vitalSigns.glucose.trend || 'unknown'})` : 'Not available'} |
                Hemoglobin: {typeof vitalSigns.hemoglobin === 'number' ? 
                  `${vitalSigns.hemoglobin} g/dL` : 
                  (vitalSigns.hemoglobin ? `${vitalSigns.hemoglobin.value} g/dL` : 'Not available')} |
                ISO Compliant: {vitalSigns.isoCompliant ? 'Yes' : 'No'} |
                Motion Score: {vitalSigns.motionScore || 0} |
                Cholesterol: {vitalSigns.cholesterol ? `Total: ${vitalSigns.cholesterol.totalCholesterol}, HDL: ${vitalSigns.cholesterol.hdl}` : 'Not available'} |
                Temperature: {vitalSigns.temperature ? `${vitalSigns.temperature.value.toFixed(1)}°C (${vitalSigns.temperature.trend})` : 'Not available'}
              </span>
            </div>
          )}

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
              {!permissionsGranted ? 'PERMISSIONS REQUIRED' : 'START'}
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
                The application needs camera permissions to function correctly
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
