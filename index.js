
import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";
import deviceContextService from "@/services/DeviceContextService";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--" 
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const measurementTimerRef = useRef(null);
  const videoTrackRef = useRef(null);
  const imageCaptureRef = useRef(null);
  const processingImageRef = useRef(false);
  const animationFrameRef = useRef(null);
  const frameProcessingEnabled = useRef(false);
  
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
    
    // Reset any previous state to ensure clean start
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    processingImageRef.current = false;
    frameProcessingEnabled.current = false;
    
    // Clear previous video track
    videoTrackRef.current = null;
    imageCaptureRef.current = null;
    
    // First set the camera on, then after a small delay start the monitoring
    setIsCameraOn(true);
    
    // Delay the monitoring start to allow camera to initialize
    setTimeout(() => {
      enterFullScreen();
      setIsMonitoring(true);
      startProcessing();
      setElapsedTime(0);
      frameProcessingEnabled.current = true;
      
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
    }, 300);
  };

  const stopMonitoring = () => {
    frameProcessingEnabled.current = false;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    processingImageRef.current = false;
    
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
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
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    // Limpieza adicional
    videoTrackRef.current = null;
    imageCaptureRef.current = null;
  };

  const handleStreamReady = (stream) => {
    console.log("Stream ready received, isMonitoring:", isMonitoring);
    
    if (!isMonitoring) {
      console.log("Not monitoring, ignoring stream");
      return;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    processingImageRef.current = false;
    
    try {
      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0) {
        console.error("No video tracks found in stream");
        return;
      }
      
      const videoTrack = tracks[0];
      videoTrackRef.current = videoTrack;
      
      if (!videoTrack || videoTrack.readyState !== 'live') {
        console.error("Video track not available or not live, state:", videoTrack?.readyState);
        return;
      }
      
      console.log("Video track is live, setting up processing");
      
      // Activar linterna si está disponible
      if (videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        }).catch(err => console.error("Error activando linterna:", err));
      }
      
      // Crear nuevo ImageCapture para este stream
      try {
        const imageCapture = new ImageCapture(videoTrack);
        imageCaptureRef.current = imageCapture;
        console.log("ImageCapture creado correctamente");
      } catch (error) {
        console.error("Error creando ImageCapture:", error);
        return;
      }
      
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      if (!tempCtx) {
        console.error("No se pudo obtener el contexto 2D");
        return;
      }
      
      processingImageRef.current = true;
      
      const processImage = async () => {
        if (!isMonitoring || !processingImageRef.current || !frameProcessingEnabled.current) {
          console.log("Skipping frame processing, conditions not met:", {
            isMonitoring,
            processingImage: processingImageRef.current,
            frameProcessingEnabled: frameProcessingEnabled.current
          });
          return;
        }
        
        try {
          // Verificar que ImageCapture sigue siendo válido
          if (!imageCaptureRef.current) {
            console.error("ImageCapture ya no está disponible");
            return;
          }
          
          // Get current track reference
          const currentTrack = videoTrackRef.current;
          
          // Verificar que el track sigue activo
          if (!currentTrack || currentTrack.readyState !== 'live') {
            console.error("Track is not in live state, skipping frame capture, state:", currentTrack?.readyState);
            
            // Si seguimos monitorizando, reintentar después de un retraso
            if (isMonitoring && processingImageRef.current && frameProcessingEnabled.current) {
              setTimeout(() => {
                if (isMonitoring && processingImageRef.current && frameProcessingEnabled.current) {
                  animationFrameRef.current = requestAnimationFrame(processImage);
                }
              }, 500);
            }
            return;
          }
          
          const frame = await imageCaptureRef.current.grabFrame();
          
          // Verificar que seguimos monitorizando
          if (!isMonitoring || !processingImageRef.current || !frameProcessingEnabled.current) {
            return;
          }
          
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          
          // Procesar la imagen para detección de luz ambiental
          if (deviceContextService.processAmbientLight) {
            deviceContextService.processAmbientLight(imageData);
          }
          
          // Procesar el frame para detección de signos vitales
          processFrame(imageData);
          
          // Continuar procesando frames si seguimos monitorizando
          if (isMonitoring && processingImageRef.current && frameProcessingEnabled.current) {
            animationFrameRef.current = requestAnimationFrame(processImage);
          }
        } catch (error) {
          console.error("Error capturando frame:", error);
          
          // Reintentar con retraso si seguimos monitorizando
          if (isMonitoring && processingImageRef.current && frameProcessingEnabled.current) {
            setTimeout(() => {
              if (isMonitoring && processingImageRef.current && frameProcessingEnabled.current) {
                animationFrameRef.current = requestAnimationFrame(processImage);
              }
            }, 500);
          }
        }
      };

      // Wait briefly before starting frame processing
      setTimeout(() => {
        if (isMonitoring && processingImageRef.current) {
          console.log("Starting frame processing");
          animationFrameRef.current = requestAnimationFrame(processImage);
        }
      }, 200);
    } catch (error) {
      console.error("Error general en handleStreamReady:", error);
    }
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
      setHeartRate(heartBeatResult.bpm);
      
      const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
      if (vitals) {
        setVitalSigns(vitals);
        setArrhythmiaCount(vitals.arrhythmiaStatus.split('|')[1] || "--");
      }
      
      setSignalQuality(lastSignal.quality);
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  useEffect(() => {
    return () => {
      frameProcessingEnabled.current = false;
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      processingImageRef.current = false;
      
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
            />
          </div>

          <div className="absolute bottom-[200px] left-0 right-0 px-4 z-30">
            <div className="grid grid-cols-4 gap-2">
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
              {!permissionsGranted ? 'PERMISOS REQUERIDOS' : 'INICIAR'}
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
                La aplicación necesita permisos de cámara para funcionar correctamente
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
