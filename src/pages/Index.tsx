
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
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Settings, Play, Square } from "lucide-react";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const measurementTimerRef = useRef<number | null>(null);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Auth effect
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/auth";
      } else {
        setEmail(session.user.email || "");
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

  const handleLogout = async () => {
    try {
      stopMonitoring();
      await supabase.auth.signOut();
      window.location.href = "/auth";
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const handleCalibrationClick = () => {
    if (isMonitoring) {
      setShowCalibrationDialog(true);
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
    resetVitalSigns();
    setElapsedTime(0);
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
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

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);

  // Calibration handlers
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

  // Visibility change effect
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

  // Stream handler
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

  // Signal processing effect
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
                onClick={handleCalibrationClick}
                disabled={!isMonitoring}
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

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full mt-[-2rem]">
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

          <div className="flex flex-col items-center gap-1 w-full max-w-md mx-auto">
            {isMonitoring && (
              <div className="text-xs font-medium text-gray-300 mb-1">
                Tiempo de medición: {elapsedTime}s / 30s
              </div>
            )}
            <Button
              onClick={isMonitoring ? stopMonitoring : startMonitoring}
              className={`flex-1 w-full measure-button ${
                isMonitoring 
                  ? 'bg-red-600/80 hover:bg-red-600' 
                  : 'bg-green-600/80 hover:bg-green-600'
              } text-white gap-2`}
            >
              {isMonitoring ? (
                <>
                  <Square className="h-4 w-4" />
                  Detener Medición
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Iniciar Medición
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <CalibrationDialog
        isOpen={showCalibrationDialog}
        onClose={() => setShowCalibrationDialog(false)}
        onCalibrationStart={handleCalibrationStart}
        onCalibrationEnd={handleCalibrationEnd}
      />
    </div>
  );
};

export default Index;
