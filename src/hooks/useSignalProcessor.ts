import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';
import { CircularBuffer } from '../utils/CircularBuffer';
import { 
  conditionPPGSignal, 
  enhancedPeakDetection, 
  assessSignalQuality 
} from '../utils/signalProcessingUtils';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const signalBufferRef = useRef<CircularBuffer>(new CircularBuffer(300)); // 10 seconds at 30fps
  const rawBufferRef = useRef<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isCalibrationPhaseRef = useRef<boolean>(true);
  const calibrationCounterRef = useRef<number>(0);
  const calibrationThresholdRef = useRef<number>(30); // 30 frames (~1s at 30fps)
  
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
      signalBufferRef.current.clear();
      rawBufferRef.current = [];
      isCalibrationPhaseRef.current = true;
      calibrationCounterRef.current = 0;
    };
  }, []);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    if (processorRef.current) {
      setIsProcessing(true);
      processorRef.current.start();
      
      signalBufferRef.current.clear();
      rawBufferRef.current = [];
      isCalibrationPhaseRef.current = true;
      calibrationCounterRef.current = 0;
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

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Iniciando calibración");
      if (processorRef.current) {
        await processorRef.current.calibrate();
        console.log("useSignalProcessor: Calibración exitosa");
        return true;
      }
      return false;
    } catch (error) {
      console.error("useSignalProcessor: Error de calibración:", error);
      return false;
    }
  }, []);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing && processorRef.current) {
      const now = performance.now();
      if (now - lastFrameTimeRef.current < 33.33) {
        return;
      }
      lastFrameTimeRef.current = now;
      
      try {
        processorRef.current.processFrame(imageData);
        
        if (lastSignal) {
          rawBufferRef.current.push(lastSignal.rawValue);
          if (rawBufferRef.current.length > 300) {
            rawBufferRef.current = rawBufferRef.current.slice(-300);
          }
          
          if (isCalibrationPhaseRef.current) {
            calibrationCounterRef.current++;
            if (calibrationCounterRef.current >= calibrationThresholdRef.current) {
              isCalibrationPhaseRef.current = false;
              console.log("useSignalProcessor: Calibración automática completada");
            }
            return;
          }
          
          const enhancedValue = conditionPPGSignal(rawBufferRef.current, lastSignal.rawValue);
          
          const dataPoint = {
            time: lastSignal.timestamp,
            value: enhancedValue,
            isArrhythmia: false
          };
          signalBufferRef.current.push(dataPoint);
          
          const signalValues = signalBufferRef.current.getPoints().map(p => p.value);
          
          if (signalValues.length >= 30) {
            const peaks = enhancedPeakDetection(signalValues);
            const quality = peaks.signalQuality;
            
            const fingerDetected = quality > 20 && lastSignal.fingerDetected;
            
            const enhancedSignal: ProcessedSignal = {
              timestamp: lastSignal.timestamp,
              rawValue: lastSignal.rawValue,
              filteredValue: enhancedValue,
              quality: quality,
              fingerDetected: fingerDetected,
              roi: lastSignal.roi
            };
            
            setLastSignal(enhancedSignal);
            
            if (window.heartBeatProcessor) {
              const heartBeatData = {
                timestamp: now,
                value: enhancedValue
              };
              window.heartBeatProcessor.processSignal(enhancedValue);
            }
          }
        }
      } catch (error) {
        console.error("useSignalProcessor: Error procesando frame:", error);
      }
    } else {
      console.log("useSignalProcessor: Frame ignorado (no está procesando)");
    }
  }, [isProcessing, lastSignal]);

  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    
    signalBufferRef.current.clear();
    rawBufferRef.current = [];
    
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
    cleanMemory
  };
};
