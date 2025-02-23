import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import SignalQualityIndicator from "@/components/SignalQualityIndicator";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import CalibrationDialog from "@/components/CalibrationDialog";
import MeasurementsHistory from "@/components/MeasurementsHistory";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Settings, Play, Square, History, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
}

const INITIAL_VITAL_SIGNS: VitalSigns = {
  spo2: 0,
  pressure: "--/--",
  arrhythmiaStatus: "--"
};

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>(INITIAL_VITAL_SIGNS);
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string>("--");
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [email, setEmail] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const measurementTimerRef = useRef<number | null>(null);
  const { toast } = useToast();

  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/auth";
      } else {
        setEmail(session.user.email || "");
        loadMeasurements();
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = "/auth";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadMeasurements = async () => {
    try {
      const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .order('measured_at', { ascending: false });

      if (error) throw error;
      setMeasurements(data || []);
    } catch (error) {
      console.error("Error al cargar mediciones:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las mediciones anteriores",
        variant: "destructive",
      });
    }
  };

  const resetMeasurement = () => {
    if (isMonitoring) {
      stopMonitoring();
    }
    setVitalSigns(INITIAL_VITAL_SIGNS);
    setHeartRate(0);
    setArrhythmiaCount("--");
    setSignalQuality(0);
    resetHeartBeat();
    resetVitalSigns();
    toast({
      title: "Medición reiniciada",
      description: "Todos los valores han sido reiniciados"
    });
  };

  const validateNumber = (value: number): boolean => {
    return typeof value === 'number' && !isNaN(value) && isFinite(value) && value > 0;
  };

  const extractArrhythmiaCount = (value: string): number => {
    if (value === '--') return 0;
    const parts = value.split('|');
    if (parts.length === 2) {
      const count = parseInt(parts[1]);
      return validateNumber(count) ? count : 0;
    }
    return 0;
  };

  const saveMeasurement = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No hay sesión activa");
      }

      const hr = Math.round(heartRate);
      const sp = Math.round(vitalSigns.spo2);
      const [systolicStr, diastolicStr] = vitalSigns.pressure.split('/');
      const sys = parseInt(systolicStr);
      const dia = parseInt(diastolicStr);
      const qual = Math.round(signalQuality);
      const arr = extractArrhythmiaCount(arrhythmiaCount);

      const errors = [];
      if (!hr || hr < 40 || hr > 200) errors.push("Frecuencia cardíaca");
      if (!sp || sp < 80 || sp > 100) errors.push("SpO2");
      if (!sys || sys < 90 || sys > 180 || !dia || dia < 50 || dia > 120) errors.push("Presión arterial");
      if (!qual || qual < 0 || qual > 100) errors.push("Calidad de señal");

      if (errors.length > 0) {
        throw new Error(`Valores incorrectos: ${errors.join(", ")}`);
      }

      const measurementData = {
        user_id: session.user.id,
        heart_rate: hr,
        spo2: sp,
        systolic: sys,
        diastolic: dia,
        arrhythmia_count: arr,
        quality: qual,
        measured_at: new Date().toISOString()
      };

      console.log("Guardando medición:", measurementData);

      const { error } = await supabase
        .from('measurements')
        .insert(measurementData);

      if (error) {
        throw error;
      }

      toast({
        title: "Medición guardada",
        description: "Los resultados han sido almacenados correctamente"
      });

      await loadMeasurements();
      resetMeasurement();
    } catch (error) {
      console.error("Error al guardar medición:", error);
      toast({
        title: "Error al guardar",
        description: error instanceof Error ? error.message : "No se pudo guardar la medición",
        variant: "destructive"
      });
    }
  };

  const handleLogout = async () => {
    try {
      stopMonitoring();
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      toast({
        title: "Error",
        description: "No se pudo cerrar la sesión",
        variant: "destructive"
      });
    }
  };

  const handleCalibrationClick = () => {
    if (isMonitoring) {
      setShowCalibrationDialog(true);
    } else {
      toast({
        title: "Medición requerida",
        description: "Inicie una medición antes de calibrar",
        variant: "destructive"
      });
    }
  };

  const startMonitoring = () => {
    setIsMonitoring(true);
    setIsCameraOn(true);
    setIsPaused(false);
    startProcessing();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
    }
    
    measurementTimerRef.current = window.setInterval(() => {
      setElapsedTime(prev => {
        if (prev >= 30) {
          stopMonitoring();
          saveMeasurement();
          return 30;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    setIsPaused(false);
    stopProcessing();
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    if (elapsedTime >= 15) {
      saveMeasurement();
    } else {
      toast({
        title: "Medición incompleta",
        description: "La medición debe durar al menos 15 segundos",
        variant: "destructive"
      });
    }
  };

  const pauseMonitoring = () => {
    if (isMonitoring) {
      setIsPaused(true);
      stopProcessing();
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    }
  };

  const resumeMonitoring = () => {
    if (isMonitoring) {
      setIsPaused(false);
      startProcessing();
      if (elapsedTime < 30 && !measurementTimerRef.current) {
        measurementTimerRef.current = window.setInterval(() => {
          setElapsedTime(prev => {
            if (prev >= 30) {
              if (measurementTimerRef.current) {
                clearInterval(measurementTimerRef.current);
                measurementTimerRef.current = null;
              }
              return 30;
            }
            return prev + 1;
          });
        }, 1000);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);

  const handleCalibrationStart = () => {
    if (isMonitoring) {
      pauseMonitoring();
    }
  };

  const handleCalibrationEnd = () => {
    if (isMonitoring) {
      resumeMonitoring();
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (isMonitoring && !isPaused) {
          pauseMonitoring();
        }
      } else {
        if (isMonitoring && isPaused && !showCalibrationDialog) {
          resumeMonitoring();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMonitoring, isPaused, showCalibrationDialog]);

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    console.log("Index: Camera stream ready", stream.getVideoTracks()[0].getSettings());
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
      console.error("Index: No se pudo obtener el contexto 2D del canvas temporal");
      return;
    }
    
    const processImage = async () => {
      if (!isMonitoring) {
        console.log("Index: Monitoreo detenido, no se procesan más frames");
        return;
      }
      
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
        console.error("Index: Error capturando frame:", error);
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
        setArrhythmiaCount(vitals.arrhythmiaStatus);
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady} 
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
            buttonPosition={document.querySelector('.measure-button')?.getBoundingClientRect()}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/30 text-gray-300 hover:text-white h-8 w-8"
                onClick={() => setShowHistoryDialog(true)}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/30 text-gray-300 hover:text-white h-8 w-8"
                onClick={handleCalibrationClick}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/30 text-gray-300 hover:text-white h-8 w-8"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full mt-[-12rem]">
            <div className="relative">
              <PPGSignalMeter 
                value={lastSignal?.filteredValue || 0}
                quality={lastSignal?.quality || 0}
                isFingerDetected={lastSignal?.fingerDetected || false}
              />
            </div>

            <SignalQualityIndicator 
              quality={signalQuality} 
              isMonitoring={isMonitoring}
            />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={vitalSigns.spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={vitalSigns.pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 w-full max-w-md mx-auto mt-[-8rem]">
            {isMonitoring && (
              <div className="text-xs font-medium text-gray-300 mb-1">
                Tiempo de medición: {elapsedTime}s / 30s
              </div>
            )}
            <div className="flex gap-2 w-full">
              <Button
                onClick={resetMeasurement}
                className="bg-gray-600/80 hover:bg-gray-600 text-white"
                disabled={!isMonitoring && heartRate === 0}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reiniciar
              </Button>
              <Button
                onClick={isMonitoring ? stopMonitoring : startMonitoring}
                className={`flex-1 measure-button ${
                  isMonitoring 
                    ? 'bg-red-600/80 hover:bg-red-600' 
                    : 'bg-green-600/80 hover:bg-green-600'
                } text-white`}
              >
                {isMonitoring ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Detener Medición
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Iniciar Medición
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CalibrationDialog
        isOpen={showCalibrationDialog}
        onClose={() => setShowCalibrationDialog(false)}
        onCalibrationStart={handleCalibrationStart}
        onCalibrationEnd={handleCalibrationEnd}
      />

      <MeasurementsHistory
        isOpen={showHistoryDialog}
        onClose={() => setShowHistoryDialog(false)}
        measurements={measurements}
      />
    </div>
  );
};

export default Index;
