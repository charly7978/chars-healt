
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const initializingRef = useRef<boolean>(false);
  const forceReinitializeRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);
  
  // Use lazy initialization for the processor
  const initializeProcessor = useCallback(() => {
    // Force re-initialization if requested
    if (forceReinitializeRef.current) {
      console.log("useSignalProcessor: Force re-initialization requested");
      if (processorRef.current) {
        processorRef.current.stop();
        processorRef.current.onSignalReady = null;
        processorRef.current.onError = null;
        processorRef.current = null;
      }
      forceReinitializeRef.current = false;
    }
    
    if (processorRef.current) return Promise.resolve();
    if (initializingRef.current) return Promise.resolve();
    
    initializingRef.current = true;
    console.log("useSignalProcessor: Creating new processor instance");
    
    try {
      processorRef.current = new PPGSignalProcessor();
      
      processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
        if (frameCountRef.current % 20 === 0) {
          console.log("useSignalProcessor: Signal received:", {
            timestamp: signal.timestamp,
            quality: signal.quality,
            filteredValue: signal.filteredValue,
            fingerDetected: signal.fingerDetected
          });
        }
        frameCountRef.current++;
        
        // Only update state if finger is detected or if there was a previous detection
        // This prevents false negatives from briefly flickering the UI
        if (signal.fingerDetected || (lastSignal && lastSignal.fingerDetected)) {
          setLastSignal(signal);
        } else if (!lastSignal) {
          // If there's no previous signal, always update to show initial state
          setLastSignal(signal);
        }
        
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
          return true;
        })
        .catch(error => {
          console.error("useSignalProcessor: Initialization error:", error);
          initializingRef.current = false;
          // Clear processor on initialization failure
          if (processorRef.current) {
            processorRef.current.onSignalReady = null;
            processorRef.current.onError = null;
            processorRef.current = null;
          }
          throw error;
        });
    } catch (error) {
      console.error("useSignalProcessor: Error creating processor:", error);
      initializingRef.current = false;
      return Promise.reject(error);
    }
  }, [lastSignal]);

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
      // If processor failed before, force reinitialization
      if (!processorRef.current) {
        forceReinitializeRef.current = true;
      }
      
      // Make sure processor is initialized before starting
      await initializeProcessor();
      
      if (processorRef.current) {
        // Set isProcessing first to ensure UI updates
        setIsProcessing(true);
        frameCountRef.current = 0;
        
        // Reset the last signal to ensure we're starting fresh
        setLastSignal(null);
        
        // Start the processor after a brief delay to ensure state has updated
        setTimeout(() => {
          if (processorRef.current) {
            processorRef.current.start();
            console.log("useSignalProcessor: Processing started successfully");
          }
        }, 50);
        
        return true;
      } else {
        console.error("useSignalProcessor: Cannot start processing - processor not initialized");
        return false;
      }
    } catch (error) {
      console.error("useSignalProcessor: Error starting processing:", error);
      setIsProcessing(false);
      return false;
    }
  }, [initializeProcessor]);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Stopping processing");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    // Do not clear lastSignal here to allow viewing the final readings
    setError(null);
    return true;
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
    if (!processorRef.current) {
      console.warn("useSignalProcessor: No processor available for frame processing");
      return;
    }
    
    if (!isProcessing) {
      return; // Don't process if not in processing state
    }
    
    try {
      processorRef.current.processFrame(imageData);
    } catch (error) {
      console.error("useSignalProcessor: Error processing frame:", error);
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
    
    forceReinitializeRef.current = true;
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
