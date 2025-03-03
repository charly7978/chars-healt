
import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';
import { HeartBeatResult } from '../types/signal';

export const useHeartBeatProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const lastProcessTimeRef = useRef<number>(0);
  const THROTTLE_INTERVAL = 50; // 50ms throttle
  
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useHeartBeatProcessor: Creating new HeartBeatProcessor instance');
      try {
        processorRef.current = new HeartBeatProcessor();
        // Make it globally accessible for debugging
        window.heartBeatProcessor = processorRef.current;
      } catch (error) {
        console.error('useHeartBeatProcessor: Error creating processor:', error);
        return null;
      }
    }
    return processorRef.current;
  }, []);
  
  const processSignal = useCallback((value: number) => {
    try {
      // Apply throttling to prevent excessive calculations
      const currentTime = Date.now();
      if (currentTime - lastProcessTimeRef.current < THROTTLE_INTERVAL) {
        return {
          bpm,
          confidence,
          isPeak,
          rrData: { intervals: [], lastPeakTime: null },
          amplitude: undefined
        };
      }
      lastProcessTimeRef.current = currentTime;
      
      // Validate input
      if (isNaN(value) || !isFinite(value)) {
        console.error('useHeartBeatProcessor: Invalid input value:', value);
        return {
          bpm: 0,
          confidence: 0,
          isPeak: false,
          rrData: { intervals: [], lastPeakTime: null },
          amplitude: undefined
        };
      }
      
      const processor = getProcessor();
      if (!processor) {
        console.error('useHeartBeatProcessor: Failed to get processor');
        return {
          bpm: 0,
          confidence: 0,
          isPeak: false,
          rrData: { intervals: [], lastPeakTime: null },
          amplitude: undefined
        };
      }
      
      const result = processor.processSignal(value);
      
      // Update state with the latest results
      if (result.bpm > 0) {
        setBpm(result.bpm);
      }
      setConfidence(result.confidence);
      setIsPeak(result.isPeak);
      
      // Get RR intervals for arrhythmia detection, including amplitudes if available
      const rrData = processor.getRRIntervals();
      
      // Extract peak amplitudes for respiration analysis
      if (result.isPeak && result.amplitude !== undefined) {
        if (!rrData.amplitudes) {
          rrData.amplitudes = [];
        }
        rrData.amplitudes.push(result.amplitude);
      }
      
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        isPeak: result.isPeak,
        rrData,
        amplitude: result.amplitude
      };
    } catch (error) {
      console.error('Error processing signal:', error);
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        rrData: { intervals: [], lastPeakTime: null },
        amplitude: undefined
      };
    }
  }, [bpm, confidence, getProcessor, isPeak]);
  
  const reset = useCallback(() => {
    console.log('useHeartBeatProcessor: Resetting processor');
    if (processorRef.current) {
      try {
        processorRef.current.reset();
      } catch (error) {
        console.error('useHeartBeatProcessor: Error resetting processor:', error);
        processorRef.current = null;
      }
    }
    
    if (!processorRef.current) {
      try {
        processorRef.current = new HeartBeatProcessor();
        window.heartBeatProcessor = processorRef.current;
      } catch (error) {
        console.error('useHeartBeatProcessor: Error creating processor during reset:', error);
      }
    }
    
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    lastProcessTimeRef.current = 0;
  }, []);
  
  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    try {
      return processorRef.current.getFinalBPM();
    } catch (error) {
      console.error('useHeartBeatProcessor: Error getting final BPM:', error);
      return 0;
    }
  }, []);
  
  const cleanMemory = useCallback(() => {
    console.log('useHeartBeatProcessor: Performing memory cleanup');
    
    // Reset states
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    lastProcessTimeRef.current = 0;
    
    // Reset and nullify processor
    if (processorRef.current) {
      try {
        processorRef.current.reset();
        // Remove global reference if it exists
        if (window.heartBeatProcessor === processorRef.current) {
          delete window.heartBeatProcessor;
        }
      } catch (error) {
        console.error('Error cleaning HeartBeatProcessor memory:', error);
      }
    }
    
    // Clear the reference
    processorRef.current = null;
    
    // Force additional garbage collection through array clearing
    setTimeout(() => {
      if (processorRef.current) {
        // Clear any internal arrays/buffers the processor might have
        try {
          processorRef.current.reset();
        } catch (error) {
          console.error('Error cleaning HeartBeatProcessor after timeout:', error);
        }
      }
    }, 100);
  }, []);
  
  return {
    bpm,
    confidence,
    isPeak,
    processSignal,
    reset,
    getFinalBPM,
    cleanMemory
  };
};
