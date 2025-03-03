
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const initializingRef = useRef<boolean>(false);
  
  // Use lazy initialization for the processor
  const initializeProcessor = useCallback(() => {
    if (processorRef.current) return Promise.resolve();
    if (initializingRef.current) return Promise.resolve();
    
    initializingRef.current = true;
    console.log("useSignalProcessor: Creating new processor instance");
    
    processorRef.current = new PPGSignalProcessor();
    
    processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
      console.log("useSignalProcessor: Signal received:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue
      });
      setLastSignal(signal);
      setError(null);
    };

    processorRef.current.onError = (error: ProcessingError) => {
      console.error("useSignalProcessor: Error received:", error);
      setError(error);
    };

    console.log("useSignalProcessor: Initializing processor");
    return processorRef.current.initialize()
      .then(() => {
        console.log("useSignalProcessor: Initialization successful");
        initializingRef.current = false;
      })
      .catch(error => {
        console.error("useSignalProcessor: Initialization error:", error);
        initializingRef.current = false;
        throw error;
      });
  }, []);

  // Create the processor on mount
  useEffect(() => {
    initializeProcessor().catch(error => {
      console.error("Failed to initialize signal processor:", error);
    });

    return () => {
      console.log("useSignalProcessor: Cleaning up and destroying processor");
      if (processorRef.current) {
        processorRef.current.stop();
        // Explicitly release references
        processorRef.current.onSignalReady = null;
        processorRef.current.onError = null;
        processorRef.current = null;
      }
      setLastSignal(null);
      setError(null);
      setIsProcessing(false);
    };
  }, [initializeProcessor]);

  const startProcessing = useCallback(async () => {
    console.log("useSignalProcessor: Starting processing");
    
    try {
      // Make sure processor is initialized before starting
      await initializeProcessor();
      
      if (processorRef.current) {
        setIsProcessing(true);
        processorRef.current.start();
      } else {
        console.error("useSignalProcessor: Cannot start processing - processor not initialized");
      }
    } catch (error) {
      console.error("useSignalProcessor: Error starting processing:", error);
      setIsProcessing(false);
    }
  }, [initializeProcessor]);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Stopping processing");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    // Explicitly free memory
    setLastSignal(null);
    setError(null);
  }, []);

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Starting calibration");
      if (!processorRef.current) {
        await initializeProcessor();
      }
      
      if (processorRef.current) {
        await processorRef.current.calibrate();
        console.log("useSignalProcessor: Calibration successful");
        return true;
      }
      return false;
    } catch (error) {
      console.error("useSignalProcessor: Calibration error:", error);
      return false;
    }
  }, [initializeProcessor]);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing && processorRef.current) {
      processorRef.current.processFrame(imageData);
    } else if (!isProcessing) {
      console.log("useSignalProcessor: Frame ignored (not processing)");
    } else if (!processorRef.current) {
      console.error("useSignalProcessor: No processor available for frame processing");
    }
  }, [isProcessing]);

  // Function for aggressive memory cleanup
  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Aggressive memory cleanup");
    
    // Stop processing first
    if (processorRef.current) {
      processorRef.current.stop();
    }
    
    // Clear state
    setLastSignal(null);
    setError(null);
    setIsProcessing(false);
    
    // Null the references
    if (processorRef.current) {
      processorRef.current.onSignalReady = null;
      processorRef.current.onError = null;
      processorRef.current = null;
    }
    
    // Force garbage collection if available
    if (window.gc) {
      try {
        window.gc();
        console.log("useSignalProcessor: Garbage collection requested");
      } catch (e) {
        console.log("useSignalProcessor: Garbage collection not available");
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
