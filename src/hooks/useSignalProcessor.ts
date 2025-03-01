
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';
import deviceContextService from '../services/DeviceContextService';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  
  // Signal queue for optimizing updates
  const pendingSignalsRef = useRef<ProcessedSignal[]>([]);
  const processingSignalRef = useRef(false);
  const lastProcessTimeRef = useRef(0);
  const SIGNAL_THROTTLE_MS = 33; // ~30fps max update rate
  
  // Adaptive frame skipping based on signal stability
  const stableSignalCountRef = useRef(0);
  const lastSignalValueRef = useRef(0);
  const signalStabilityThresholdRef = useRef(2.0);
  const frameSkipCountRef = useRef(0);
  
  // Web Worker for intensive calculations
  const workerRef = useRef<Worker | null>(null);
  const workerResponseHandlersRef = useRef<Map<number, (result: any) => void>>(new Map());
  
  // Initialize Web Worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../workers/signalProcessingWorker.ts', import.meta.url), 
        { type: 'module' }
      );
      
      workerRef.current.onmessage = (e) => {
        if (e.data.type === 'result') {
          const handler = workerResponseHandlersRef.current.get(e.data.timestamp);
          if (handler) {
            handler(e.data);
            workerResponseHandlersRef.current.delete(e.data.timestamp);
          }
        }
      };
      
      console.log("useSignalProcessor: Web Worker initialized");
      
      return () => {
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
          workerResponseHandlersRef.current.clear();
        }
      };
    } catch (error) {
      console.error("useSignalProcessor: Failed to initialize Web Worker", error);
    }
  }, []);
  
  // Process signals in a batch to reduce React render cycles
  const processSignalQueue = useCallback(() => {
    if (processingSignalRef.current) return;
    
    processingSignalRef.current = true;
    
    try {
      const now = Date.now();
      if (now - lastProcessTimeRef.current < SIGNAL_THROTTLE_MS) {
        processingSignalRef.current = false;
        return;
      }
      
      if (pendingSignalsRef.current.length === 0) {
        processingSignalRef.current = false;
        return;
      }
      
      // Get the latest signal and clear the queue
      const latestSignal = pendingSignalsRef.current[pendingSignalsRef.current.length - 1];
      pendingSignalsRef.current = [];
      
      setLastSignal(latestSignal);
      lastProcessTimeRef.current = now;
    } finally {
      processingSignalRef.current = false;
    }
  }, []);
  
  // Use lazy initialization for the processor
  useEffect(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador");
    processorRef.current = new PPGSignalProcessor();
    
    processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
      // Adaptive frame skipping logic
      if (lastSignalValueRef.current > 0) {
        const diff = Math.abs(signal.filteredValue - lastSignalValueRef.current);
        
        // Adjust stability counter based on difference
        if (diff < signalStabilityThresholdRef.current) {
          stableSignalCountRef.current = Math.min(stableSignalCountRef.current + 1, 20);
        } else {
          stableSignalCountRef.current = Math.max(0, stableSignalCountRef.current - 2);
        }
        
        // Dynamically adjust frame skipping based on stability
        if (stableSignalCountRef.current > 15) {
          // Very stable signal - process only 1 in 4 frames
          frameSkipCountRef.current = (frameSkipCountRef.current + 1) % 4;
          if (frameSkipCountRef.current !== 0) {
            return; // Skip this frame
          }
        } else if (stableSignalCountRef.current > 8) {
          // Moderately stable - process 1 in 2 frames
          frameSkipCountRef.current = (frameSkipCountRef.current + 1) % 2;
          if (frameSkipCountRef.current !== 0) {
            return; // Skip this frame
          }
        } else {
          // Unstable signal - process every frame
          frameSkipCountRef.current = 0;
        }
      }
      
      lastSignalValueRef.current = signal.filteredValue;
      
      // Instead of immediately updating state, queue the signal
      pendingSignalsRef.current.push(signal);
      
      // Use requestAnimationFrame for smoother updates synchronized with display refresh
      requestAnimationFrame(processSignalQueue);
      
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
        // Explicitly free references
        processorRef.current.onSignalReady = null;
        processorRef.current.onError = null;
        processorRef.current = null;
      }
      
      // Clear any pending signals
      pendingSignalsRef.current = [];
    };
  }, [processSignalQueue]);

  // Monitor app visibility and idle state
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - aggressively clean up resources
        cleanMemory();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    if (processorRef.current) {
      setIsProcessing(true);
      processorRef.current.start();
      
      // Reset adaptative parameters
      stableSignalCountRef.current = 0;
      lastSignalValueRef.current = 0;
      frameSkipCountRef.current = 0;
    }
  }, []);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    // Explicitly free memory
    setLastSignal(null);
    setError(null);
    pendingSignalsRef.current = [];
    
    // Clear worker cache
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'clear-cache' });
    }
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

  // Optimize frame processing by using a ref to track the processing state
  // instead of using the state value directly
  const isProcessingRef = useRef(false);
  
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);
  
  // Process frame with adaptive skipping and Web Worker offloading
  const processFrame = useCallback((imageData: ImageData) => {
    if (!isProcessingRef.current || !processorRef.current) {
      return;
    }
    
    // Update device context with ambient light information
    deviceContextService.processAmbientLight(imageData);
    
    // Skip processing if app is backgrounded or device is idle
    if (deviceContextService.isBackgrounded || deviceContextService.isDeviceIdle) {
      return;
    }
    
    processorRef.current.processFrame(imageData);
  }, []);

  // Function to aggressively free memory
  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    pendingSignalsRef.current = [];
    
    // Reset all refs
    stableSignalCountRef.current = 0;
    lastSignalValueRef.current = 0;
    frameSkipCountRef.current = 0;
    
    // Clear worker cache
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'clear-cache' });
    }
    
    // Force garbage collector if available
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
