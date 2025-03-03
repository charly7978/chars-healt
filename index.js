import React, { useState, useRef, useEffect } from "react";
import VitalSign from "@/components/VitalSign";
import CameraView from "@/components/CameraView";
import { useSignalProcessor } from "@/hooks/useSignalProcessor";
import { useHeartBeatProcessor } from "@/hooks/useHeartBeatProcessor";
import { useVitalSignsProcessor } from "@/hooks/useVitalSignsProcessor";
import PPGSignalMeter from "@/components/PPGSignalMeter";
import PermissionsHandler from "@/components/PermissionsHandler";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [vitalSigns, setVitalSigns] = useState({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiration: { rate: 0, depth: 0, regularity: 0 },
    hasRespirationData: false,
    glucose: 0,
    glucoseTrend: 'stable',
    glucoseConfidence: 0
  });
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState("--");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const measurementTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const isProcessingFrameRef = useRef(false);
  
  const { startProcessing, stopProcessing, lastSignal, processFrame, isProcessing } = useSignalProcessor();
  const { processSignal: processHeartBeat, reset: resetHeartBeat } = useHeartBeatProcessor();
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

  const fullReset = () => {
    console.log("Performing full reset of all components");
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    setIsMonitoring(false);
    setIsCameraOn(false);
    setElapsedTime(0);
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: 0,
      glucoseTrend: 'stable',
      glucoseConfidence: 0
    });
    setArrhythmiaCount("--");
    setSignalQuality(0);
    
    resetHeartBeat();
    resetVitalSigns();
    stopProcessing();
    
    startTimeRef.current = 0;
    isProcessingFrameRef.current = false;
  };

  const startMonitoring = async () => {
    if (!permissionsGranted) {
      console.log("No se puede iniciar sin permisos");
      return;
    }
    
    if (isTransitioning) {
      console.log("Ya hay una transición en curso, ignorando");
      return;
    }
    
    setIsTransitioning(true);
    
    if (isMonitoring) {
      await stopMonitoring();
      setTimeout(() => {
        doStartMonitoring();
      }, 500);
    } else {
      doStartMonitoring();
    }
  };
  
  const doStartMonitoring = async () => {
    console.log("Iniciando monitorización");
    
    try {
      fullReset();
      
      await enterFullScreen();
      setIsCameraOn(true);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const success = await startProcessing();
      if (!success) {
        console.error("Error al iniciar el procesamiento de señal");
        setIsTransitioning(false);
        setIsCameraOn(false);
        return;
      }
      
      setIsMonitoring(true);
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(prev => {
          if (elapsed >= 30) {
            stopMonitoring();
            return 30;
          }
          return elapsed;
        });
      }, 1000);
      
      console.log("Monitorización iniciada correctamente");
    } catch (error) {
      console.error("Error al iniciar monitorización:", error);
      fullReset();
    } finally {
      setIsTransitioning(false);
    }
  };

  const stopMonitoring = async () => {
    if (isTransitioning) {
      console.log("Ya hay una transición en curso, ignorando");
      return;
    }
    
    setIsTransitioning(true);
    console.log("Deteniendo monitorización");
    
    try {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      
      setIsMonitoring(false);
      await stopProcessing();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      setIsCameraOn(false);
      
      resetVitalSigns();
      resetHeartBeat();
      
      setElapsedTime(0);
      setHeartRate(0);
      setVitalSigns({ 
        spo2: 0, 
        pressure: "--/--",
        arrhythmiaStatus: "--",
        respiration: { rate: 0, depth: 0, regularity: 0 },
        hasRespirationData: false,
        glucose: 0,
        glucoseTrend: 'stable',
        glucoseConfidence: 0
      });
      setArrhythmiaCount("--");
      setSignalQuality(0);
      
      console.log("Monitorización detenida correctamente");
    } catch (error) {
      console.error("Error al detener monitorización:", error);
      fullReset();
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleStreamReady = (stream) => {
    console.log("Stream ready, isMonitoring:", isMonitoring, "isCameraOn:", isCameraOn);
    
    if (!isCameraOn) {
      console.log("Stream ready but camera is off, ignoring");
      return;
    }
    
    try {
      console.log("Stream ready, setting up frame capture");
      const videoTrack = stream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(videoTrack);
      
      if (videoTrack.getCapabilities()?.torch) {
        videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        }).catch(err => console.error("Error activating torch:", err));
      }
      
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        console.error("Could not get 2D context");
        return;
      }
      
      const processImage = async () => {
        if (!isCameraOn || isProcessingFrameRef.current) return;
        
        try {
          isProcessingFrameRef.current = true;
          const frame = await imageCapture.grabFrame();
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          processFrame(imageData);
          isProcessingFrameRef.current = false;
          
          if (isCameraOn) {
            requestAnimationFrame(processImage);
          }
        } catch (error) {
          console.error("Error capturing frame:", error);
          isProcessingFrameRef.current = false;
          
          if (isCameraOn) {
            setTimeout(() => requestAnimationFrame(processImage), 200);
          }
        }
      };

      setTimeout(() => {
        if (isCameraOn) {
          processImage();
        }
      }, 300);
    } catch (error) {
      console.error("Error in handleStreamReady:", error);
    }
  };

  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      try {
        const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
        if (heartBeatResult && heartBeatResult.bpm > 0) {
          setHeartRate(heartBeatResult.bpm);
          
          const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
          
          if (vitals) {
            console.log("Respiration data:", vitals.respiration, "hasData:", vitals.hasRespirationData);
            
            setVitalSigns(vitals);
            setArrhythmiaCount(vitals.arrhythmiaStatus.split('|')[1] || "--");
          }
          
          setSignalQuality(lastSignal.quality);
        }
      } catch (error) {
        console.error("Error processing signal:", error);
      }
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns]);

  useEffect(() => {
    return () => {
      console.log("Index component unmounting, cleaning up");
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
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
            <div className="grid grid-cols-5 gap-2">
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
                value={vitalSigns.hasRespirationData ? vitalSigns.respiration.rate : "--"}
                unit="RPM"
                secondaryValue={vitalSigns.hasRespirationData ? vitalSigns.respiration.depth : "--"}
                secondaryUnit="Prof."
                isFinalReading={vitalSigns.hasRespirationData && elapsedTime >= 15}
              />
            </div>
          </div>

          {isMonitoring && (
            <div className="absolute bottom-[150px] left-0 right-0 text-center z-30 text-xs text-gray-400">
              <span>Resp Data: {vitalSigns.hasRespirationData ? 'Disponible' : 'No disponible'} | 
              Rate: {vitalSigns.respiration.rate} RPM | Depth: {vitalSigns.respiration.depth}</span>
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
              disabled={!permissionsGranted || isTransitioning}
              className={`w-full h-full text-2xl font-bold text-white active:bg-gray-800 
                ${!permissionsGranted ? 'bg-gray-600' : isTransitioning ? 'bg-gray-700' : 'bg-black/80'}`}
            >
              {!permissionsGranted 
                ? 'PERMISOS REQUERIDOS' 
                : isTransitioning 
                  ? 'INICIANDO...' 
                  : isMonitoring 
                    ? 'REINICIAR'
                    : 'INICIAR'}
            </button>
            <button 
              onClick={stopMonitoring}
              disabled={isTransitioning}
              className={`w-full h-full bg-black/80 text-2xl font-bold text-white active:bg-gray-800 
                ${isTransitioning ? 'bg-gray-700' : 'bg-black/80'}`}
            >
              {isTransitioning ? 'DETENIENDO...' : 'RESET'}
            </button>
          </div>
          
          {!permissionsGranted && (
            <div className="absolute bottom-20 left-0 right-0 text-center px-4 z-30">
              <span className="text-lg font-medium text-red-400">
                La aplicación necesita permisos de cámara para funcionar correctamente
              </span>
            </div>
          )}
          
          <div className="absolute top-2 right-2 z-50 text-xs bg-black/70 p-1 rounded text-white">
            {isMonitoring ? 'MONITOR: ON' : 'MONITOR: OFF'} | 
            {isCameraOn ? 'CAM: ON' : 'CAM: OFF'} |
            {isProcessing ? 'PROC: ON' : 'PROC: OFF'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
