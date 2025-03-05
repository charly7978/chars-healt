
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';
import { useCalibration } from './useCalibration';
import { useSignalProcessing } from './useSignalProcessing';
import { useFrameRate } from './useFrameRate';

/**
 * Hook principal para el procesamiento de señales PPG
 * Con optimizaciones agresivas de rendimiento
 */
export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const processingThrottleRef = useRef<number>(0); // Throttle counter
  
  // Hooks específicos con parámetros optimizados
  const frameRate = useFrameRate(15); // Reduced from 30 to 15fps
  const signalProcessing = useSignalProcessing();
  const calibration = useCalibration(processorRef);
  
  // Inicializar el procesador
  useEffect(() => {
    console.log("useSignalProcessor: Creating new processor instance");
    processorRef.current = new PPGSignalProcessor();
    
    processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
      // Throttle update frequency for better performance
      processingThrottleRef.current = (processingThrottleRef.current + 1) % 2;
      if (processingThrottleRef.current !== 0) return;
      
      setLastSignal(signal);
      setError(null);
    };

    processorRef.current.onError = (error: ProcessingError) => {
      console.error("useSignalProcessor: Error received:", error);
      setError(error);
    };

    console.log("useSignalProcessor: Initializing processor");
    processorRef.current.initialize().catch(error => {
      console.error("useSignalProcessor: Initialization error:", error);
    });

    return () => {
      console.log("useSignalProcessor: Cleaning up processor");
      cleanupProcessor();
    };
  }, []);

  // Función para limpiar el procesador
  const cleanupProcessor = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.stop();
      processorRef.current.onSignalReady = null;
      processorRef.current.onError = null;
      processorRef.current = null;
    }
    signalProcessing.resetSignalBuffers();
    calibration.resetCalibration();
    frameRate.resetFrameTimer();
  }, [signalProcessing, calibration, frameRate]);

  // Iniciar el procesamiento
  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Starting processing");
    if (processorRef.current) {
      setIsProcessing(true);
      processorRef.current.start();
      
      signalProcessing.resetSignalBuffers();
      calibration.resetCalibration();
      frameRate.resetFrameTimer();
    }
  }, [signalProcessing, calibration, frameRate]);

  // Detener el procesamiento
  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Stopping processing");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    setLastSignal(null);
    setError(null);
    
    // Force garbage collection hint
    setTimeout(() => {
      cleanMemory();
    }, 300);
  }, []);

  // Procesar un frame de la cámara
  const processFrame = useCallback((imageData: ImageData) => {
    if (!isProcessing || !processorRef.current) {
      return;
    }
    
    // Control de frame rate agresivo para mejor rendimiento
    if (!frameRate.shouldProcessFrame()) {
      return;
    }
    
    try {
      // Procesar el frame con el PPGSignalProcessor
      processorRef.current.processFrame(imageData);
      
      // Si tenemos una señal, la procesamos adicionalmente
      if (lastSignal) {
        // Verificar si estamos en fase de calibración
        if (calibration.isCalibrationPhase()) {
          const calibrationComplete = calibration.updateCalibrationCounter();
          if (!calibrationComplete) {
            return;
          }
        }
        
        // Throttle processing for better performance - only process every other frame
        processingThrottleRef.current = (processingThrottleRef.current + 1) % 2;
        if (processingThrottleRef.current !== 0) return;
        
        // Procesar la señal
        const processedResult = signalProcessing.processSignal(lastSignal);
        if (processedResult) {
          // Crear señal mejorada
          const enhancedSignal: ProcessedSignal = {
            timestamp: lastSignal.timestamp,
            rawValue: lastSignal.rawValue,
            filteredValue: processedResult.enhancedValue,
            quality: processedResult.quality,
            fingerDetected: processedResult.fingerDetected,
            roi: lastSignal.roi,
            isPeak: processedResult.isPeak
          };
          
          setLastSignal(enhancedSignal);
        }
      }
    } catch (error) {
      console.error("useSignalProcessor: Error processing frame:", error);
    }
  }, [isProcessing, lastSignal, calibration, signalProcessing, frameRate]);

  // Limpieza agresiva de memoria
  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Aggressive memory cleanup");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    
    signalProcessing.resetSignalBuffers();
    
    // Clear any pending timeouts or intervals
    const highestTimeoutId = setTimeout(() => {}, 0);
    for (let i = 0; i < highestTimeoutId; i++) {
      clearTimeout(i);
    }
    
    if (window.gc) {
      try {
        window.gc();
        console.log("useSignalProcessor: Garbage collection requested");
      } catch (e) {
        console.log("useSignalProcessor: Garbage collection unavailable");
      }
    }
  }, [signalProcessing]);

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
