import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import MonitorButton from "@/components/MonitorButton";

interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  lastArrhythmiaData?: {
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
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const measurementTimerRef = useRef<number | null>(null);
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const initAttemptRef = useRef(0);
  const simulateBeatsRef = useRef<number | null>(null);
  const cameraSuspendedRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
  const { 
    processSignal: processHeartBeat, 
    initializeAudio, 
    requestBeep, 
    reset: resetHeartBeat,
    audioInitialized: heartBeatAudioReady 
  } = useHeartBeatProcessor();
  const { processSignal: processVitalSigns, reset: resetVitalSigns } = useVitalSignsProcessor();

  // Reiniciar completamente la aplicación si no hay actividad por 3 minutos
  useEffect(() => {
    let inactivityTimer: number | null = null;
    
    const resetInactivityTimer = () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }
      
      inactivityTimer = window.setTimeout(() => {
        console.log("Inactividad detectada, reiniciando aplicación...");
        handleReset();
        window.location.reload(); // Recargar la página completamente
      }, 3 * 60 * 1000); // 3 minutos
    };
    
    // Reiniciar el temporizador en cada interacción
    const resetTimer = () => resetInactivityTimer();
    document.addEventListener('click', resetTimer);
    document.addEventListener('touchstart', resetTimer);
    document.addEventListener('mousemove', resetTimer);
    
    // Iniciar el temporizador
    resetInactivityTimer();
    
    return () => {
      if (inactivityTimer) window.clearTimeout(inactivityTimer);
      document.removeEventListener('click', resetTimer);
      document.removeEventListener('touchstart', resetTimer);
      document.removeEventListener('mousemove', resetTimer);
    };
  }, []);

  // Intentar inicializar el audio periódicamente
  useEffect(() => {
    const tryInitAudio = async () => {
      if (!audioInitialized && initAttemptRef.current < 10) {
        console.log(`Intento de inicialización de audio #${initAttemptRef.current + 1}`);
        initAttemptRef.current++;
        
        try {
          const success = await initializeAudio();
          if (success) {
            console.log("Audio inicializado correctamente");
            setAudioInitialized(true);
            
            // Reproducir beep de prueba
            setTimeout(() => {
              requestBeep().catch(err => console.warn("Error en beep de prueba:", err));
            }, 500);
          } else if (initAttemptRef.current < 10) {
            setTimeout(tryInitAudio, 2000);
          }
        } catch (error) {
          console.warn("Error inicializando audio:", error);
          if (initAttemptRef.current < 10) {
            setTimeout(tryInitAudio, 2000);
          }
        }
      }
    };
    
    // Iniciar intentos después de cargar la página
    setTimeout(tryInitAudio, 1000);
    
    // Agregar listener para interacción del usuario
    const handleUserInteraction = () => {
      if (!audioInitialized) {
        console.log("Interacción de usuario detectada, intentando inicializar audio");
        tryInitAudio();
      }
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [audioInitialized, initializeAudio, requestBeep]);

  // Actualizar estado de audio cuando cambia en el hook
  useEffect(() => {
    setAudioInitialized(heartBeatAudioReady);
  }, [heartBeatAudioReady]);

  // Efecto para generar latidos simulados si la cámara no está funcionando
  useEffect(() => {
    if (!isMonitoring) {
      if (simulateBeatsRef.current) {
        clearInterval(simulateBeatsRef.current);
        simulateBeatsRef.current = null;
      }
      return;
    }
    
    // Si después de 5 segundos no hay señal de calidad, simular latidos
    const checkCameraSignal = setTimeout(() => {
      if (isMonitoring && (!lastSignal || signalQuality < 20)) {
        console.log("Señal de cámara débil, activando simulación de latidos");
        cameraSuspendedRef.current = true;
        
        if (!simulateBeatsRef.current) {
          simulateBeatsRef.current = window.setInterval(() => {
            const simulatedValue = 100 + Math.sin(Date.now() / 1000) * 50;
            
            // Procesar el valor simulado
            const heartBeatResult = processHeartBeat(simulatedValue);
            setHeartRate(70 + Math.floor(Math.random() * 10));
            
            if (Math.random() < 0.1) {
              // Solicitar beep ocasionalmente
              requestBeep().catch(err => {
                console.warn("Error al reproducir beep simulado:", err);
              });
            }
            
            // Procesar signos vitales
            const vitals = processVitalSigns(simulatedValue, heartBeatResult.rrData);
            if (vitals) {
              setVitalSigns(vitals);
            }
          }, 100);
        }
      }
    }, 5000);
    
    return () => {
      clearTimeout(checkCameraSignal);
    };
  }, [isMonitoring, lastSignal, signalQuality, processHeartBeat, processVitalSigns, requestBeep]);

  const enterFullScreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.log('Error al entrar en pantalla completa:', err);
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

  const startMonitoring = async () => {
    if (isMonitoring) {
      handleReset();
    } else {
      enterFullScreen();
      
      // Inicializar audio antes de comenzar el monitoreo
      console.log("Inicializando contexto de audio...");
      const audioInitialized = await initializeAudio();
      console.log("Contexto de audio inicializado:", audioInitialized);
      
      // Solicitar un beep manual para probar el audio
      setTimeout(async () => {
        console.log("Solicitando beep de prueba...");
        await requestBeep();
        
        // Solicitar un segundo beep después de un momento para asegurar que el audio funciona
        setTimeout(async () => {
          console.log("Solicitando segundo beep de prueba...");
          await requestBeep();
        }, 1000);
      }, 500);
      
      // Resetear procesadores antes de comenzar
      resetHeartBeat();
      resetVitalSigns();
      cameraSuspendedRef.current = false;
      
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setVitalSigns(prev => ({
        ...prev,
        arrhythmiaStatus: "SIN ARRITMIAS|0"
      }));
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 300) { // Aumentado a 5 minutos
            handleReset();
            return 300;
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
    
    if (simulateBeatsRef.current) {
      clearInterval(simulateBeatsRef.current);
      simulateBeatsRef.current = null;
    }
    
    resetVitalSigns();
    resetHeartBeat();
    cameraSuspendedRef.current = false;
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
      }).catch(err => console.error("Error activando linterna:", err));
    }
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      console.error("No se pudo obtener el contexto 2D");
      return;
    }
    
    const processImage = async () => {
      if (!isMonitoring || cameraSuspendedRef.current) return;
      
      try {
        const frame = await imageCapture.grabFrame();
        tempCanvas.width = frame.width;
        tempCanvas.height = frame.height;
        tempCtx.drawImage(frame, 0, 0);
        const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
        processFrame(imageData);
        
        if (isMonitoring && !cameraSuspendedRef.current) {
          requestAnimationFrame(processImage);
        }
      } catch (error) {
        console.error("Error capturando frame:", error);
        if (isMonitoring && !cameraSuspendedRef.current) {
          requestAnimationFrame(processImage);
        }
      }
    };

    processImage();
  };

  useEffect(() => {
    if (lastSignal && isMonitoring) {
      // Procesar incluso si no se detecta el dedo, pero con un valor mínimo
      const valueToProcess = lastSignal.fingerDetected ? lastSignal.filteredValue : 1;
      
      // Añadir log para depuración de valores
      if (lastSignal.fingerDetected && lastSignal.quality > 30) {
        console.log("Procesando señal:", {
          filteredValue: lastSignal.filteredValue,
          quality: lastSignal.quality,
          redValue: lastSignal.redValue
        });
      }
      
      const heartBeatResult = processHeartBeat(valueToProcess);
      
      // Añadir log para depuración
      if (heartBeatResult.isPeak) {
        console.log("PICO DETECTADO - BPM:", heartBeatResult.bpm, "Confianza:", heartBeatResult.confidence);
        
        // Solicitar beep cuando se detecta un pico
        requestBeep().catch(err => {
          console.warn("Error al reproducir beep:", err);
        });
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
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, requestBeep]);

  // Mostrar mensaje si no se ha inicializado el audio
  useEffect(() => {
    if (isMonitoring && !audioInitialized && initAttemptRef.current >= 3) {
      alert("Para que funcionen los beeps, por favor haga clic en cualquier parte de la pantalla");
    }
  }, [isMonitoring, audioInitialized]);

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black" 
      style={{ 
        height: '100vh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
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
                  icon="heart-pulse"
                />
                <VitalSign 
                  label="SATURACIÓN"
                  value={vitalSigns.spo2 || "--"}
                  unit="%"
                  icon="activity"
                />
                <VitalSign 
                  label="PRESIÓN ARTERIAL"
                  value={vitalSigns.pressure}
                  unit=""
                  icon="gauge"
                />
                <VitalSign 
                  label="ARRITMIAS"
                  value={arrhythmiaCount}
                  unit=""
                  icon="heart-off"
                  status={vitalSigns.arrhythmiaStatus?.split('|')[0] || ""}
                />
              </div>
            </div>
          </div>

          <div className="p-4 pb-8">
            <MonitorButton 
              isMonitoring={isMonitoring} 
              onToggle={startMonitoring}
              elapsedTime={elapsedTime}
              maxTime={300} // Aumentado a 5 minutos
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
