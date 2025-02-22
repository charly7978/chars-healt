
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
import { useNavigate } from "react-router-dom";

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
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { startProcessing, stopProcessing, lastSignal, processFrame, calibrate } = useSignalProcessor();
  const processingRef = useRef<boolean>(false);
  const { processSignal: processHeartBeat } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();
  const { toast } = useToast();

  useEffect(() => {
    processingRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    if (!isMonitoring) {
      setElapsedTime(0);
      setArrhythmiaCount("--");
      setVitalSigns(prev => ({ ...prev, arrhythmiaStatus: "--" }));
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = (currentTime - startTime) / 1000;
      setElapsedTime(elapsed);

      if (elapsed >= 30) {
        const event = new CustomEvent('measurementComplete');
        window.dispatchEvent(event);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  useEffect(() => {
    if (lastSignal) {
      console.log("Index: Actualizando calidad de señal:", lastSignal.quality);
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal]);

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected) {
      console.log("Index: Procesando señal cardíaca y vital", {
        value: lastSignal.filteredValue,
        fingerDetected: lastSignal.fingerDetected,
        quality: lastSignal.quality
      });
      
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus);
      }
    }
  }, [lastSignal, processHeartBeat, processVitalSigns]);

  useEffect(() => {
    const handleMeasurementComplete = (e: Event) => {
      e.preventDefault();
      handleStopMeasurement();
    };

    window.addEventListener('measurementComplete', handleMeasurementComplete);
    return () => window.removeEventListener('measurementComplete', handleMeasurementComplete);
  }, []);

  const handleStreamReady = (stream: MediaStream) => {
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
      if (!processingRef.current) {
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
        
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Index: Error capturando frame:", error);
        if (processingRef.current) {
          requestAnimationFrame(processImage);
        }
      }
    };

    console.log("Index: Iniciando monitoreo de signos vitales");
    setIsMonitoring(true);
    processingRef.current = true;
    processImage();
  };

  const handleStartMeasurement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("Index: Iniciando nueva medición");
    startProcessing();
    setIsCameraOn(true);
  };

  const handleStopMeasurement = () => {
    console.log("Index: Deteniendo medición", {
      finalMeasurements: {
        heartRate,
        spo2: vitalSigns.spo2,
        bloodPressure: vitalSigns.pressure,
        arrhythmiaStatus: vitalSigns.arrhythmiaStatus
      }
    });
    
    setIsMonitoring(false);
    processingRef.current = false;
    stopProcessing();
    setSignalQuality(0);
    setIsCameraOn(false);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleStopMeasurement();
    resetVitalSigns();
    setVitalSigns({ spo2: 0, pressure: "--/--", arrhythmiaStatus: "--" });
    setHeartRate(0);
    setArrhythmiaCount("--");
  };

  const handleSignOut = async () => {
    try {
      handleStopMeasurement();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error al cerrar sesión:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo cerrar sesión. Intente nuevamente.",
        });
        return;
      }
      navigate("/auth");
    } catch (error) {
      console.error("Error inesperado al cerrar sesión:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error inesperado. Intente nuevamente.",
      });
    }
  };

  const handleCalibration = async () => {
    try {
      console.log("Index: Iniciando proceso de calibración");
      setIsCalibrating(true);
      setShowCalibrationDialog(true);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log("Index: Ejecutando calibración del procesador");
      const success = await calibrate();
      
      if (success) {
        console.log("Index: Calibración exitosa");
        setIsCalibrating(false);
        
        toast({
          title: "Calibración Exitosa",
          description: "Los parámetros han sido ajustados según las condiciones actuales.",
          duration: 3000,
        });
      } else {
        console.error("Index: Fallo en la calibración");
        toast({
          variant: "destructive",
          title: "Error de Calibración",
          description: "Asegúrese de mantener el dedo firme sobre el sensor e intente nuevamente.",
          duration: 3000,
        });
        setIsCalibrating(false);
        setShowCalibrationDialog(false);
      }
    } catch (error) {
      console.error("Index: Error durante la calibración:", error);
      toast({
        variant: "destructive",
        title: "Error de Calibración",
        description: "Error en el proceso de calibración. Verifique la posición del dedo.",
        duration: 3000,
      });
      setIsCalibrating(false);
      setShowCalibrationDialog(false);
    }
  };

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
              <div className="text-base font-mono text-medical-blue bg-black/30 px-3 py-1 rounded">
                {isMonitoring ? `${Math.ceil(30 - elapsedTime)}s` : '30s'}
              </div>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                className="text-white hover:bg-white/20"
              >
                Cerrar Sesión
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

          <div className="flex justify-center gap-2 w-full">
            {!isMonitoring ? (
              <Button
                onClick={handleStartMeasurement}
                className="bg-medical-blue hover:bg-medical-blue/90"
              >
                Iniciar Medición
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleStopMeasurement}
                  variant="destructive"
                >
                  Detener
                </Button>
                <Button
                  onClick={handleCalibration}
                  variant="outline"
                  disabled={isCalibrating}
                >
                  Calibrar
                </Button>
                <Button
                  onClick={handleReset}
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                >
                  Reiniciar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      
      {showCalibrationDialog && (
        <CalibrationDialog
          onClose={() => setShowCalibrationDialog(false)}
          isCalibrating={isCalibrating}
        />
      )}
    </div>
  );
};

export default Index;
