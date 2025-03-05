
import { useState, useRef, useEffect } from 'react';
import { useSignalProcessor } from '@/hooks/useSignalProcessor';
import { useHeartBeatProcessor } from '@/hooks/useHeartBeatProcessor';
import { useVitalSignsProcessor } from '@/hooks/useVitalSignsProcessor';
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';
import { useVitalSignsData } from './useVitalSignsData';

export function useMonitoring() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [measurementComplete, setMeasurementComplete] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  
  const measurementTimerRef = useRef<number | null>(null);
  
  const { 
    vitalSigns, heartRate, lastArrhythmiaData, finalValues,
    resetValues, calculateFinalValues, processVitalsData, 
    processHeartRateData, evaluateRisks
  } = useVitalSignsData();
  
  const { startProcessing, stopProcessing, lastSignal, processFrame } = useSignalProcessor();
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
  
  const prepareProcessorsOnly = () => {
    console.log("Preparando SOLO procesadores (displays intactos)");
    
    setElapsedTime(0);
    
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  };
  
  const stopMonitoringOnly = () => {
    try {
      console.log("Deteniendo SOLO monitorización (displays intactos)");
      
      setIsMonitoring(false);
      setIsCameraOn(false);
      stopProcessing();
      setMeasurementComplete(true);
      
      evaluateRisks();
      calculateFinalValues();
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    } catch (error) {
      console.error("Error en stopMonitoringOnly:", error);
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      setIsMonitoring(false);
      setIsCameraOn(false);
    }
  };
  
  const startMonitoring = () => {
    if (!permissionsGranted) {
      console.log("No se puede iniciar sin permisos");
      return;
    }
    
    if (!isMonitoring && lastSignal?.quality < 50) {
      console.log("Señal insuficiente para iniciar medición", lastSignal?.quality);
      return;
    }
    
    if (isMonitoring) {
      stopMonitoringOnly();
    } else {
      prepareProcessorsOnly();
      
      setIsMonitoring(true);
      setIsCameraOn(true);
      startProcessing();
      setElapsedTime(0);
      setMeasurementComplete(false);
      
      resetValues();
      
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
      
      measurementTimerRef.current = window.setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= 40) {
            stopMonitoringOnly();
            return 40;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };
  
  const handleReset = () => {
    console.log("RESET COMPLETO solicitado");
    
    setIsMonitoring(false);
    setIsCameraOn(false);
    stopProcessing();
    
    if (measurementTimerRef.current) {
      clearInterval(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }
    
    resetValues();
    setElapsedTime(0);
    setMeasurementComplete(false);
    
    resetHeartBeat();
    resetVitalSigns();
    VitalSignsRisk.resetHistory();
  };
  
  const handleStreamReady = (stream: MediaStream) => {
    if (!isMonitoring) return;
    
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        console.error("No video track available in stream");
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
      
      let frameProcessingActive = true;
      
      const processImage = async () => {
        if (!isMonitoring || !frameProcessingActive) return;
        
        try {
          if (videoTrack.readyState !== 'live') {
            console.log('Video track is not in live state, waiting...');
            if (isMonitoring && frameProcessingActive) {
              setTimeout(() => requestAnimationFrame(processImage), 500);
            }
            return;
          }
          
          const frame = await imageCapture.grabFrame();
          tempCanvas.width = frame.width;
          tempCanvas.height = frame.height;
          tempCtx.drawImage(frame, 0, 0);
          const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height);
          processFrame(imageData);
          
          if (isMonitoring && frameProcessingActive) {
            requestAnimationFrame(processImage);
          }
        } catch (error) {
          console.error("Error capturando frame:", error);
          if (isMonitoring && frameProcessingActive) {
            setTimeout(() => requestAnimationFrame(processImage), 500);
          }
        }
      };

      processImage();
      
      return () => {
        console.log("Cleaning up video processing resources");
        frameProcessingActive = false;
        
        if (videoTrack.getCapabilities()?.torch) {
          videoTrack.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
      };
    } catch (error) {
      console.error("Error setting up image capture:", error);
      return () => {};
    }
  };
  
  useEffect(() => {
    if (!isMonitoring && isCameraOn) {
      try {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then(stream => {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getCapabilities()?.torch) {
              videoTrack.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(err => console.error("Error desactivando linterna:", err));
            }
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => console.error("Error al intentar apagar la linterna:", err));
      } catch (err) {
        console.error("Error al acceder a la cámara para apagar la linterna:", err);
      }
    }
  }, [isMonitoring, isCameraOn]);
  
  useEffect(() => {
    if (lastSignal && lastSignal.fingerDetected && isMonitoring) {
      try {
        const heartBeatResult = processHeartBeat(lastSignal.filteredValue);
        
        if (!measurementComplete) {
          if (heartBeatResult.bpm > 0) {
            processHeartRateData(heartBeatResult.bpm);
          }
          
          const vitals = processVitalSigns(lastSignal.filteredValue, heartBeatResult.rrData);
          if (vitals) {
            processVitalsData(vitals);
          }
        
          setSignalQuality(lastSignal.quality);
        }
      } catch (error) {
        console.error("Error procesando señal:", error);
      }
    }
  }, [lastSignal, isMonitoring, processHeartBeat, processVitalSigns, measurementComplete]);
  
  useEffect(() => {
    return () => {
      if (measurementTimerRef.current) {
        clearInterval(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, []);
  
  return {
    isMonitoring,
    isCameraOn, 
    signalQuality,
    vitalSigns,
    heartRate,
    elapsedTime,
    lastArrhythmiaData,
    measurementComplete,
    finalValues,
    permissionsGranted,
    handlePermissionsGranted,
    handlePermissionsDenied,
    startMonitoring,
    handleReset,
    handleStreamReady,
    lastSignal
  };
}
