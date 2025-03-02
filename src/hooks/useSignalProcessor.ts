import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [signalProfile, setSignalProfile] = useState<{
    baseline: number;
    amplitude: number;
    noiseLevel: number;
    signaturePattern: number[];
  } | null>(null);
  
  useEffect(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador");
    processorRef.current = new PPGSignalProcessor();
    
    processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
      console.log("useSignalProcessor: Señal recibida:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue
      });
      setLastSignal(signal);
      setError(null);
    };

    processorRef.current.onError = (error: ProcessingError) => {
      console.error("useSignalProcessor: Error recibido:", error);
      setError(error);
    };

    console.log("useSignalProcessor: Iniciando procesador");
    processorRef.current.initialize().catch(error => {
      console.error("useSignalProcessor: Error de inicialización:", error);
    });

    return () => {
      console.log("useSignalProcessor: Limpiando y destruyendo procesador");
      if (processorRef.current) {
        processorRef.current.stop();
        processorRef.current.onSignalReady = null;
        processorRef.current.onError = null;
        processorRef.current = null;
      }
    };
  }, []);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    if (processorRef.current) {
      setIsProcessing(true);
      processorRef.current.start();
    }
  }, []);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    setLastSignal(null);
    setError(null);
  }, []);

  const calibrate = useCallback(() => {
    try {
      console.log("useSignalProcessor: Iniciando calibración avanzada");
      setIsCalibrating(true);
      setCalibrationProgress(0);
      
      if (processorRef.current) {
        const calibrationSteps = 20;
        const calibrationBufferSize = 120; // 4 segundos a 30Hz
        const calibrationBuffer: number[] = [];
        let currentStep = 0;
        
        const progressInterval = setInterval(() => {
          currentStep++;
          const progress = Math.min(100, Math.round((currentStep / calibrationSteps) * 100));
          setCalibrationProgress(progress);
          
          if (currentStep >= calibrationSteps) {
            clearInterval(progressInterval);
            
            if (calibrationBuffer.length > 0) {
              const baseline = calibrationBuffer.reduce((sum, val) => sum + val, 0) / calibrationBuffer.length;
              const max = Math.max(...calibrationBuffer);
              const min = Math.min(...calibrationBuffer);
              const amplitude = max - min;
              
              const squaredDifferences = calibrationBuffer.map(val => Math.pow(val - baseline, 2));
              const variance = squaredDifferences.reduce((sum, val) => sum + val, 0) / calibrationBuffer.length;
              const noiseLevel = Math.sqrt(variance);
              
              const patternLength = 30; // ~1 segundo
              let bestPatternStartIndex = 0;
              let bestPatternScore = Number.MAX_VALUE;
              
              for (let i = 0; i < calibrationBuffer.length - patternLength; i++) {
                const segment = calibrationBuffer.slice(i, i + patternLength);
                const segmentAvg = segment.reduce((sum, val) => sum + val, 0) / patternLength;
                const segmentVariance = segment.reduce((sum, val) => sum + Math.pow(val - segmentAvg, 2), 0) / patternLength;
                
                if (segmentVariance < bestPatternScore) {
                  bestPatternScore = segmentVariance;
                  bestPatternStartIndex = i;
                }
              }
              
              const signaturePattern = calibrationBuffer
                .slice(bestPatternStartIndex, bestPatternStartIndex + patternLength)
                .map(val => (val - baseline) / (amplitude || 1)); // Normalizar
              
              const profile = {
                baseline,
                amplitude,
                noiseLevel,
                signaturePattern
              };
              
              setSignalProfile(profile);
              console.log("useSignalProcessor: Perfil de señal calculado:", profile);
              
              if (processorRef.current) {
                try {
                  processorRef.current.calibrate()
                    .then(() => {
                      console.log("useSignalProcessor: Calibración básica del procesador completada");
                      
                      console.log("useSignalProcessor: Aplicando parámetros de calibración personalizados:", {
                        baselineOffset: baseline,
                        amplitudeScale: amplitude > 0 ? 1 / amplitude : 1,
                        noiseThreshold: noiseLevel * 0.5
                      });
                      
                      processorRef.current?.calibrate();
                    })
                    .catch(error => {
                      console.error("useSignalProcessor: Error en calibración básica:", error);
                    });
                } catch (error) {
                  console.error("useSignalProcessor: Error en calibración básica:", error);
                }
              }
            }
            
            setIsCalibrating(false);
          }
        }, 200);
        
        const collectCalibrationData = (signal: ProcessedSignal) => {
          if (calibrationBuffer.length < calibrationBufferSize) {
            calibrationBuffer.push(signal.filteredValue);
          }
        };
        
        const originalSignalHandler = processorRef.current.onSignalReady;
        processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
          if (originalSignalHandler) originalSignalHandler(signal);
          if (isCalibrating) collectCalibrationData(signal);
        };
        
        setTimeout(() => {
          if (processorRef.current) {
            processorRef.current.onSignalReady = originalSignalHandler;
          }
        }, calibrationSteps * 200 + 100);
        
        return true;
      }
      
      setIsCalibrating(false);
      return false;
    } catch (error) {
      console.error("useSignalProcessor: Error de calibración:", error);
      setIsCalibrating(false);
      return false;
    }
  }, [isCalibrating]);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing && processorRef.current) {
      console.log("useSignalProcessor: Procesando nuevo frame");
      processorRef.current.processFrame(imageData);
    } else {
      console.log("useSignalProcessor: Frame ignorado (no está procesando)");
    }
  }, [isProcessing]);

  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    setSignalProfile(null);
    
    if (window.gc) {
      try {
        window.gc();
        console.log("useSignalProcessor: Garbage collection solicitada");
      } catch (e) {
        console.log("useSignalProcessor: Garbage collection no disponible");
      }
    }
  }, []);

  return {
    isProcessing,
    lastSignal,
    error,
    startProcessing,
    stopProcessing,
    calibrate,
    processFrame,
    cleanMemory,
    isCalibrating,
    calibrationProgress,
    signalProfile
  };
};
