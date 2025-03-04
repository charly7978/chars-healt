
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';
import { CircularBuffer } from '../utils/CircularBuffer';
import { 
  conditionPPGSignal, 
  enhancedPeakDetection, 
  assessSignalQuality,
  applySMAFilter,
  panTompkinsAdaptedForPPG
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
    processorRef.current.initialize().catch(error => {
      console.error("useSignalProcessor: Initialization error:", error);
    });

    return () => {
      console.log("useSignalProcessor: Cleaning up processor");
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
    console.log("useSignalProcessor: Starting processing");
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
    console.log("useSignalProcessor: Stopping processing");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    setLastSignal(null);
    setError(null);
  }, []);

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Starting calibration");
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
              console.log("useSignalProcessor: Automatic calibration completed");
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
          
          // Get signal values for cardiac analysis
          const signalValues = signalBufferRef.current.getPoints().map(p => p.value);
          
          if (signalValues.length >= 90) { // At least 3 seconds of data for reliable analysis
            // Apply the advanced cardiac algorithm (Pan-Tompkins adapted for PPG)
            // Choose the most reliable algorithm based on signal characteristics
            const signalMean = signalValues.reduce((sum, val) => sum + val, 0) / signalValues.length;
            const signalMax = Math.max(...signalValues);
            const signalMin = Math.min(...signalValues);
            const signalRange = signalMax - signalMin;
            
            let cardiacAnalysis;
            
            // Use enhanced peak detection for typical PPG signals
            if (signalRange / signalMean > 0.1) { // Good signal-to-noise ratio
              cardiacAnalysis = enhancedPeakDetection(signalValues);
              console.log("Using enhanced peak detection algorithm");
            } else { // For lower quality signals, use the Pan-Tompkins algorithm 
              cardiacAnalysis = panTompkinsAdaptedForPPG(signalValues);
              console.log("Using Pan-Tompkins algorithm for noisy signal");
            }
            
            const quality = cardiacAnalysis.signalQuality;
            const fingerDetected = quality > 20 && lastSignal.fingerDetected;
            
            // Check if current point is a peak
            const currentIndex = signalValues.length - 1;
            const isPeak = cardiacAnalysis.peakIndices.includes(currentIndex);
            
            const enhancedSignal: ProcessedSignal = {
              timestamp: lastSignal.timestamp,
              rawValue: lastSignal.rawValue,
              filteredValue: enhancedValue,
              quality: quality,
              fingerDetected: fingerDetected,
              roi: lastSignal.roi,
              isPeak: isPeak
            };
            
            setLastSignal(enhancedSignal);
            
            // Pass to heart beat processor if available
            if (window.heartBeatProcessor) {
              window.heartBeatProcessor.processSignal(enhancedValue);
            }
            
            // Log cardiac analysis results for debugging
            if (cardiacAnalysis.heartRate) {
              console.log(`Cardiac analysis: HR=${cardiacAnalysis.heartRate}, quality=${quality}%`);
            }
          }
        }
      } catch (error) {
        console.error("useSignalProcessor: Error processing frame:", error);
      }
    }
  }, [isProcessing, lastSignal]);

  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Aggressive memory cleanup");
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
        console.log("useSignalProcessor: Garbage collection requested");
      } catch (e) {
        console.log("useSignalProcessor: Garbage collection unavailable");
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
