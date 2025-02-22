
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Settings, Play, Square } from "lucide-react";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [email, setEmail] = useState<string>("");
  
  const { toast } = useToast();
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Control de sesión solamente
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

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      stopMonitoring();
      await supabase.auth.signOut();
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión correctamente"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cerrar la sesión"
      });
    }
  };

  const startMonitoring = () => {
    setIsMonitoring(true);
    setIsCameraOn(true);
    startProcessing();
    toast({
      title: "Medición Iniciada",
      description: "El sistema está monitoreando sus signos vitales"
    });
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    resetVitalSigns();
    toast({
      title: "Medición Detenida",
      description: "El sistema ha detenido el monitoreo"
    });
  };

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
  }, [lastSignal, isMonitoring]);

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      <div className="relative w-full h-full">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady} 
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col justify-between p-4">
          <div className="flex justify-between items-start w-full">
            <h1 className="text-lg font-bold text-white bg-black/30 px-3 py-1 rounded">PPG Monitor</h1>
            <div className="flex gap-2">
              <div className="text-sm text-gray-300 bg-black/30 px-3 py-1 rounded">
                {email}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/30 text-gray-300 hover:text-white"
                onClick={() => setShowCalibrationDialog(true)}
                disabled={isMonitoring}
              >
                <Settings className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/30 text-gray-300 hover:text-white"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2 max-w-md mx-auto w-full">
            <PPGSignalMeter 
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
            />

            <SignalQualityIndicator quality={signalQuality} />

            <div className="grid grid-cols-2 gap-2">
              <VitalSign label="Heart Rate" value={heartRate} unit="BPM" />
              <VitalSign label="SpO2" value={vitalSigns.spo2} unit="%" />
              <VitalSign label="Blood Pressure" value={vitalSigns.pressure} unit="mmHg" />
              <VitalSign label="Arrhythmias" value={arrhythmiaCount} />
            </div>
          </div>

          <div className="flex justify-center gap-2 w-full max-w-md mx-auto">
            <Button
              onClick={isMonitoring ? stopMonitoring : startMonitoring}
              className={`flex-1 ${
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
      />
    </div>
  );
};

export default Index;
