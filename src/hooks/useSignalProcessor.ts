
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
  
  // Use inicialización lazy para el procesador
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
        // Liberar referencias explícitamente
        processorRef.current.onSignalReady = null;
        processorRef.current.onError = null;
        processorRef.current = null;
      }
      // Clear buffers
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
      
      // Reset signal buffer
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
    // Liberar memoria explícitamente
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
      // Frame rate limiting - process at most 30fps
      const now = performance.now();
      if (now - lastFrameTimeRef.current < 33.33) { // 1000ms/30fps ≈ 33.33ms
        return; // Skip this frame to maintain at most 30fps
      }
      lastFrameTimeRef.current = now;
      
      try {
        // Use the existing signal processor to extract raw PPG signal
        processorRef.current.processFrame(imageData);
        
        // Extract key information from the last received signal
        if (lastSignal) {
          // Add raw value to buffer
          rawBufferRef.current.push(lastSignal.rawValue);
          if (rawBufferRef.current.length > 300) { // Keep buffer at manageable size
            rawBufferRef.current = rawBufferRef.current.slice(-300);
          }
          
          // Calibration phase
          if (isCalibrationPhaseRef.current) {
            calibrationCounterRef.current++;
            if (calibrationCounterRef.current >= calibrationThresholdRef.current) {
              isCalibrationPhaseRef.current = false;
              console.log("useSignalProcessor: Calibración automática completada");
            }
            return; // During calibration, just collect data
          }
          
          // Apply our advanced signal processing
          const enhancedValue = conditionPPGSignal(rawBufferRef.current, lastSignal.rawValue);
          
          // Add the processed point to our circular buffer
          const dataPoint = {
            time: lastSignal.timestamp,
            value: enhancedValue,
            isArrhythmia: false // We'll detect this later
          };
          signalBufferRef.current.push(dataPoint);
          
          // Get the buffer data and assess signal quality
          const signalValues = signalBufferRef.current.getPoints().map(p => p.value);
          
          // Only proceed if we have enough data for meaningful analysis
          if (signalValues.length >= 30) {
            // Detect peaks for enhanced signal quality assessment
            const peaks = enhancedPeakDetection(signalValues);
            const quality = peaks.signalQuality;
            
            // Detect finger presence based on signal properties and quality
            const fingerDetected = quality > 20 && lastSignal.fingerDetected;
            
            // Create an enhanced processed signal
            const enhancedSignal: ProcessedSignal = {
              timestamp: lastSignal.timestamp,
              rawValue: lastSignal.rawValue,
              filteredValue: enhancedValue,
              quality: quality,
              fingerDetected: fingerDetected,
              roi: lastSignal.roi
            };
            
            // Update the lastSignal with our enhanced processing
            setLastSignal(enhancedSignal);
            
            // If connected to the window object, also update that for wider use
            if (window.heartBeatProcessor) {
              const enhancedBpmData = {
                timestamp: now,
                value: enhancedValue,
                isPeak: false, // This will be determined by the heart beat processor
                bpm: 0
              };
              window.heartBeatProcessor.processPoint(enhancedBpmData);
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

  // Función para liberar memoria de forma más agresiva
  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    
    // Clear buffers
    signalBufferRef.current.clear();
    rawBufferRef.current = [];
    
    // Forzar limpieza del garbage collector si está disponible
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
