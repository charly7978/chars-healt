
import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    glucose: null,
    lastArrhythmiaData: null
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [glucoseValue, setGlucoseValue] = useState("");
  const measurementTimerRef = useRef(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns, calibrateGlucose } = useVitalSignsProcessor();

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
      glucose: null,
      lastArrhythmiaData: null
    });
    setArrhythmiaCount("--");
    setSignalQuality(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
  };

  const handleCalibrateGlucose = () => {
    setIsCalibrationOpen(true);
  };

  const submitGlucoseCalibration = () => {
    const glucoseLevel = parseInt(glucoseValue);
    if (!isNaN(glucoseLevel) && glucoseLevel >= 40 && glucoseLevel <= 400) {
      const success = calibrateGlucose(glucoseLevel);
      if (success) {
        toast({
          title: "Calibración exitosa",
          description: `Nivel de glucosa calibrado a ${glucoseLevel} mg/dL.`,
        });
      } else {
        toast({
          title: "Error de calibración",
          description: "No se pudo calibrar el nivel de glucosa. Inténtelo de nuevo.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "Valor inválido",
        description: "Por favor ingrese un valor entre 40 y 400 mg/dL.",
        variant: "destructive",
      });
    }
    setGlucoseValue("");
    setIsCalibrationOpen(false);
  };

  const handleStreamReady = (stream) => {
    if (!isMonitoring) return;
    
    let videoTrack;
    try {
      videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        console.error("No video tracks found in stream");
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
      
      const checkTrackAndProcess = async () => {
        if (!isMonitoring) return;
        
        try {
          if (!videoTrack || videoTrack.readyState !== 'live') {
            console.log("Video track not ready or no longer active");
            if (isMonitoring) {
              setTimeout(() => requestAnimationFrame(checkTrackAndProcess), 500);
            }
            return;
          }
          
          const frame = await imageCapture.grabFrame();
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          processFrame(imageData);
          
          if (isMonitoring) {
            requestAnimationFrame(checkTrackAndProcess);
          }
        } catch (error) {
          console.error("Error procesando frame:", error);
          if (isMonitoring) {
            setTimeout(() => requestAnimationFrame(checkTrackAndProcess), 500);
          }
        }
      };

      checkTrackAndProcess();
    } catch (error) {
      console.error("Error setting up image capture:", error);
    }
    
    return () => {
      try {
        if (videoTrack && videoTrack.getCapabilities()?.torch) {
          videoTrack.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
      } catch (e) {
        console.error("Error in cleanup:", e);
      }
    };
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      
      if (vitals) {
        console.log("Vital signs processed:", {
          spo2: vitals.spo2,
          pressure: vitals.pressure,
          arrhythmiaStatus: vitals.arrhythmiaStatus,
          lastArrhythmiaData: vitals.lastArrhythmiaData
        });
        
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus.split('|')[1] || "--");
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  const getTrendIcon = (trend) => {
    if (!trend) return "";
    switch (trend) {
      case 'rising': return "↑";
      case 'falling': return "↓";
      case 'rising_rapidly': return "↑↑";
      case 'falling_rapidly': return "↓↓";
      default: return "→";
    }
  };

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
              rawArrhythmiaData={vitalSigns.lastArrhythmiaData}
            />
          </div>

          <div className="absolute bottom-[200px] left-0 right-0 px-4 z-30">
            <div className="grid grid-cols-6 gap-2">
              <VitalSign 
                label="FRECUENCIA CARDÍACA"
                value={heartRate || "--"}
                unit="BPM"
                isFinalReading={heartRate > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="SPO2"
                value={vitalSigns.spo2 || "--"}
                unit="%"
                isFinalReading={vitalSigns.spo2 > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="PRESIÓN ARTERIAL"
                value={vitalSigns.pressure}
                unit="mmHg"
                isFinalReading={vitalSigns.pressure !== "--/--" && elapsedTime >= 15}
              />
              <VitalSign 
                label="ARRITMIAS"
                value={vitalSigns.arrhythmiaStatus}
                isFinalReading={heartRate > 0 && elapsedTime >= 15}
              />
              <VitalSign 
                label="RESPIRACIÓN"
                value="--"
                unit="RPM"
                secondaryValue="--"
                secondaryUnit="Prof."
                isFinalReading={false}
              />
              <VitalSign 
                label="GLUCOSA"
                value={vitalSigns.glucose ? vitalSigns.glucose.value : "--"}
                unit="mg/dL"
                secondaryValue={vitalSigns.glucose ? getTrendIcon(vitalSigns.glucose.trend) : ""}
                secondaryLabel={vitalSigns.glucose ? `Conf: ${vitalSigns.glucose.confidence}%` : ""}
                isFinalReading={vitalSigns.glucose && vitalSigns.glucose.value > 0 && elapsedTime >= 15}
                onClick={handleCalibrateGlucose}
              />
            </div>
          </div>

          {isMonitoring && (
            <div className="absolute bottom-[150px] left-0 right-0 text-center z-30 text-xs text-gray-400">
              <span>Glucosa: {vitalSigns.glucose ? `${vitalSigns.glucose.value} mg/dL (${vitalSigns.glucose.confidence}%)` : 'No disponible'} | 
              Arritmias: {arrhythmiaCount !== "--" ? arrhythmiaCount : "0"}</span>
            </div>
          )}

          {isMonitoring && (
            <div className="absolute bottom-40 left-0 right-0 text-center z-30">
              <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 30s</span>
            </div>
          )}

          <div className="h-[80px] grid grid-cols-3 gap-px bg-gray-900 mt-auto relative z-30">
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
            <button 
              onClick={handleCalibrateGlucose}
              className="w-full h-full bg-black/80 text-2xl font-bold text-white active:bg-gray-800"
            >
              CALIBRAR GLUCOSA
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

      <Dialog open={isCalibrationOpen} onOpenChange={setIsCalibrationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Calibrar Medición de Glucosa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="glucose" className="text-sm font-medium">
                Ingrese el valor de glucosa de referencia (mg/dL):
              </label>
              <Input
                id="glucose"
                type="number"
                value={glucoseValue}
                onChange={(e) => setGlucoseValue(e.target.value)}
                placeholder="Por ejemplo: 120"
                min="40"
                max="400"
              />
              <span className="text-xs text-gray-500">
                Ingrese un valor entre 40 y 400 mg/dL para calibrar el algoritmo
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCalibrationOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={submitGlucoseCalibration}>
              Calibrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
