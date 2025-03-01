
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

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
    // Explicitly free memory
    setLastSignal(null);
    setError(null);
    pendingSignalsRef.current = [];
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
  
  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessingRef.current && processorRef.current) {
      processorRef.current.processFrame(imageData);
    }
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
