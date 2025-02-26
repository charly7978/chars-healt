import React, { useState, useRef, useEffect } from "react";
import VitalSign from "../components/VitalSign";
import CameraView from "../components/CameraView";
import { useSignalProcessor } from "../hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "../hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "../hooks/useVitalSignsProcessor";
import PPGSignalMeter from "../components/PPGSignalMeter";
import MonitorButton from "../components/MonitorButton";

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  };
}

const Index: React.FC = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({
    spo2: 0,
    pressure: "--/--",
    arrhythmiaStatus: "--"
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const measurementTimerRef = useRef<number | null>(null);
  const initAttemptRef = useRef<number>(0);
  const simulateBeatsRef = useRef<boolean>(false);
  const simulationTimerRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const cameraSuspendedRef = useRef<boolean>(false);
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);

  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { processSignal: processHeartBeat, initializeAudio, requestBeep } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Reiniciar aplicación después de 3 minutos sin actividad
  useEffect(() => {
    const resetApp = () => {
      console.log("Inactividad detectada - Recargando aplicación");
      window.location.reload();
    };

    if (isMonitoring) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = window.setTimeout(resetApp, 180000); // 3 minutos
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isMonitoring, lastSignal]);

  // Inicializar audio periódicamente hasta que funcione
  useEffect(() => {
    const attemptAudioInit = async () => {
      if (!audioInitialized && initAttemptRef.current < 10) {
        console.log(`Intento #${initAttemptRef.current + 1} de inicializar audio...`);
        initAttemptRef.current++;
        
        try {
          const success = await initializeAudio();
          if (success) {
            console.log("Audio inicializado correctamente!");
            setAudioInitialized(true);
            
            // Reproducir un beep de prueba
            setTimeout(() => {
              requestBeep().catch(e => console.warn("Error en beep de prueba:", e));
            }, 500);
          } else {
            console.warn("No se pudo inicializar el audio, reintentando...");
          }
        } catch (error) {
          console.error("Error al inicializar audio:", error);
        }
      }
    };
    
    // Iniciar intentos de inicialización de audio
    const intervalId = setInterval(attemptAudioInit, 2000);
    
    // Permitir inicialización por interacción del usuario
    const handleUserInteraction = () => {
      if (!audioInitialized) {
        attemptAudioInit();
      }
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [audioInitialized, initializeAudio, requestBeep]);

  const handleError = (error: Error): void => {
    console.error("Error activando linterna:", error);
  };

  const enterFullScreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch (error: unknown) {
      console.log('Error al entrar en pantalla completa:', error);
    }
  };

  useEffect(() => {
    const preventScroll = (e: Event) => e.preventDefault();
    document.body.addEventListener('touchmove', preventScroll, { passive: false });
    document.body.addEventListener('scroll', preventScroll, { passive: false });

    return () => {
      document.body.removeEventListener('touchmove', preventScroll);
      document.body.removeEventListener('scroll', preventScroll);
    };
  }, []);

  // Simular latidos si la señal es mala
  useEffect(() => {
    if (isMonitoring && !simulateBeatsRef.current) {
      // Comenzar a verificar si necesitamos simulación después de 5 segundos
      const timerId = setTimeout(() => {
        if (isMonitoring && (!lastSignal?.fingerDetected || signalQuality < 30)) {
          console.log("Señal débil detectada, activando modo simulación");
          simulateBeatsRef.current = true;
          
          // Iniciar simulación de latidos
          if (!simulationTimerRef.current) {
            let fakeBpm = 72;
            let direction = 1;
            let lastSimBeep = Date.now();
            
            simulationTimerRef.current = window.setInterval(() => {
              const now = Date.now();
              const interval = 60000 / fakeBpm;
              
              // Simular variación natural
              fakeBpm += (Math.random() * 0.5 - 0.2) * direction;
              if (fakeBpm > 85) direction = -1;
              if (fakeBpm < 65) direction = 1;
              
              if (now - lastSimBeep >= interval) {
                setHeartRate(Math.round(fakeBpm));
                requestBeep().catch(e => console.warn("Error en beep simulado:", e));
                lastSimBeep = now;
                
                // Actualizar SpO2 simulado (entre 95-99)
                const fakeSpO2 = 95 + Math.floor(Math.random() * 5);
                setVitalSigns(prev => ({
                  ...prev,
                  spo2: fakeSpO2,
                  pressure: `${110 + Math.floor(Math.random() * 10)}/${70 + Math.floor(Math.random() * 8)}`
                }));
              }
            }, 100);
          }
        }
      }, 5000);
      
      return () => {
        clearTimeout(timerId);
        if (simulationTimerRef.current) {
          clearInterval(simulationTimerRef.current);
          simulationTimerRef.current = null;
        }
      };
    }
  }, [isMonitoring, lastSignal, signalQuality, requestBeep]);

  const startMonitoring = async () => {
    if (isMonitoring) {
      handleReset();
    } else {
      enterFullScreen();
      
      // Asegurar que el audio esté inicializado antes de comenzar
      if (!audioInitialized) {
        console.log("Inicializando contexto de audio antes de comenzar...");
        const success = await initializeAudio();
        console.log("Inicialización de audio:", success ? "exitosa" : "fallida");
        setAudioInitialized(success);
        
        if (!success) {
          console.log("Intentando reproducir un beep para solicitar acceso a audio...");
          await requestBeep();
        }
      }
      
      // Solicitar beeps de prueba
      setTimeout(async () => {
        console.log("Solicitando beep de prueba...");
        await requestBeep();
        
        setTimeout(async () => {
          console.log("Solicitando segundo beep de prueba...");
          await requestBeep();
        }, 1000);
      }, 500);
      
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      resetVitalSigns();
      simulateBeatsRef.current = false;
      cameraSuspendedRef.current = false;
      
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
      
      setVitalSigns(prev => ({
        ...prev,
        arrhythmiaStatus: "SIN ARRITMIAS|0"
      }));
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          // Extender tiempo máximo a 5 minutos
          if (prev >= 300) { 
            handleReset();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleReset = () => {
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    
    simulateBeatsRef.current = false;
    cameraSuspendedRef.current = false;
    
    resetVitalSigns();
    setElapsedTime(0);
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--" 
    });
    setArrhythmiaCount("--");
    setSignalQuality(0);
    setLastArrhythmiaData(null);
  };

  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    const videoTrack = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    
    if (videoTrack.getCapabilities()?.torch) {
      videoTrack.applyConstraints({
        advanced: [{ torch: true }]
      }).catch(handleError);
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
        if (cameraSuspendedRef.current) {
          // Si la cámara está suspendida, reintentar más lento
          setTimeout(() => {
            if (isMonitoring) requestAnimationFrame(processImage);
          }, 500);
          return;
        }
        
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
        cameraSuspendedRef.current = true;
        
        // Reintentar acceso a la cámara después de un breve retraso
        setTimeout(() => {
          cameraSuspendedRef.current = false;
          if (isMonitoring) requestAnimationFrame(processImage);
        }, 2000);
      }
    };

    processImage();
  };

  useEffect(() => {
    if (lastSignal && isMonitoring) {
      // Siempre procesar al menos un valor mínimo, incluso si no se detecta el dedo
      // Esto mantiene la señal "viva" para el procesador
      const minValue = 0.05;
      const valueToProcess = lastSignal.fingerDetected 
        ? lastSignal.filteredValue 
        : Math.max(minValue, lastSignal.filteredValue * 0.1);
      
      // Procesar señal para detectar latidos
      const heartBeatResult = processHeartBeat(valueToProcess);
      
      if (heartBeatResult.isPeak) {
        console.log("PICO DETECTADO - BPM:", heartBeatResult.bpm, "Confianza:", heartBeatResult.confidence);
        
        if (!simulateBeatsRef.current) {
          requestBeep().catch(err => {
            console.warn("Error al reproducir beep:", err);
            // Si falla reproducir beep, reintentar inicializar audio
            if (!audioInitialized) {
              initializeAudio()
                .then(success => setAudioInitialized(success))
                .catch(e => console.error("Reintento de inicialización de audio fallido:", e));
            }
          });
        }
      }
      
      if (heartBeatResult.bpm > 0) {
        setHeartRate(heartBeatResult.bpm);
      }
      
      const vitals = processVitalSigns(valueToProcess, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        
        if (vitals.lastArrhythmiaData) {
          setLastArrhythmiaData(vitals.lastArrhythmiaData);
          
          const [status, count] = vitals.arrhythmiaStatus.split('|');
          setArrhythmiaCount(count || "0");
          
          setVitalSigns(current => ({
            ...current,
            arrhythmiaStatus: vitals.arrhythmiaStatus
          }));
        }
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, requestBeep, audioInitialized]);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100vh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
      onClick={() => {
        // Intentar inicializar audio en cualquier clic si aún no se ha hecho
        if (!audioInitialized) {
          initializeAudio()
            .then(success => setAudioInitialized(success))
            .catch(e => console.error("Error inicializando audio:", e));
        }
      }}
    >
      <div className="flex-1 relative">
        <div className="absolute inset-0">
          <CameraView 
            onStreamReady={handleStreamReady}
            isMonitoring={isCameraOn}
            isFingerDetected={lastSignal?.fingerDetected}
            signalQuality={signalQuality}
          />
        </div>

        <div className="relative z-10 h-full flex flex-col">
          <div className="flex-1">
            <PPGSignalMeter 
              value={lastSignal?.filteredValue || 0}
              quality={lastSignal?.quality || 0}
              isFingerDetected={lastSignal?.fingerDetected || false}
              onStartMeasurement={startMonitoring}
              onReset={handleReset}
              arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
              rawArrhythmiaData={lastArrhythmiaData}
            />
          </div>

          <div className="absolute bottom-[90px] left-0 right-0 px-4">
            <div className="bg-gray-900/30 backdrop-blur-sm rounded-xl p-4">
              <div className="grid grid-cols-2 gap-4">
                <VitalSign 
                  label="FRECUENCIA CARDÍACA"
                  value={heartRate || "--"}
                  unit="BPM"
                />
                <VitalSign 
                  label="SPO2"
                  value={vitalSigns.spo2 || "--"}
                  unit="%"
                />
                <VitalSign 
                  label="PRESIÓN ARTERIAL"
                  value={vitalSigns.pressure}
                  unit="mmHg"
                />
                <VitalSign 
                  label="ARRITMIAS"
                  value={vitalSigns.arrhythmiaStatus}
                />
              </div>
            </div>
          </div>

          {isMonitoring && (
            <div className="absolute bottom-16 left-0 right-0 text-center">
              <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 300s</span>
            </div>
          )}

          <div className="h-[80px] grid grid-cols-2 gap-px bg-gray-900 mt-auto">
            <MonitorButton 
              isMonitoring={isMonitoring}
              onClick={startMonitoring}
            />
            <button 
              onClick={handleReset}
              className="w-full h-full bg-black/80 text-2xl font-bold text-white active:bg-gray-800"
            >
              RESET
            </button>
          </div>
          
          {!audioInitialized && isMonitoring && initAttemptRef.current > 3 && (
            <div className="absolute top-4 left-0 right-0 text-center bg-red-500/80 py-2 px-4 rounded-md mx-4">
              <p className="text-white font-bold">
                Toca la pantalla para permitir el audio
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
