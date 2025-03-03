import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';
import { HeartBeatResult } from '../types/signal';

export const useHeartBeatProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
      processorRef.current = new HeartBeatProcessor();
      // Make it globally accessible for debugging
      // @ts-ignore - Global window property for debugging
      window.heartBeatProcessor = processorRef.current;
    }
    return processorRef.current;
  }, []);
  
  const processSignal = useCallback((value: number) => {
    try {
      const processor = getProcessor();
      const result = processor.processSignal(value);
      
      // Update state with the latest results
      setBpm(result.bpm);
      setConfidence(result.confidence);
      setIsPeak(result.isPeak);
      
      // Get RR intervals with amplitudes for arrhythmia detection
      const rrData = processor.getRRIntervals();
      const lastPeakTime = result.isPeak ? Date.now() : null;
      
      // Ensure we have amplitudes for arrhythmia detection
      const amplitudes = rrData.amplitudes || [];
      
      // Add current peak amplitude if it's a peak
      if (result.isPeak && result.amplitude !== undefined) {
        if (!rrData.amplitudes) {
          rrData.amplitudes = [];
        }
        rrData.amplitudes.push(result.amplitude);
        console.log("HeartBeatProcessor: Peak detected with amplitude:", result.amplitude);
      }
      
      console.log("useHeartBeatProcessor: Processed signal", { 
        bpm: result.bpm, 
        confidence: result.confidence, 
        isPeak: result.isPeak,
        intervals: rrData.intervals.length,
        amplitudes: amplitudes.length,
        amplitude: result.amplitude
      });
      
      // Enhanced data structure with all necessary information
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        isPeak: result.isPeak,
        rrData: {
          intervals: rrData.intervals,
          lastPeakTime: lastPeakTime,
          amplitudes: rrData.amplitudes
        },
        amplitude: result.amplitude
      };
    } catch (error) {
      console.error('Error processing signal:', error);
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        rrData: { intervals: [], lastPeakTime: null, amplitudes: [] },
        amplitude: undefined
      };
    }
  }, [getProcessor]);
  
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
  }, []);
  
  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    return processorRef.current.getFinalBPM();
  }, []);
  
  const cleanMemory = useCallback(() => {
    console.log('useHeartBeatProcessor: Performing memory cleanup');
    
    // Reset states
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    
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
    const clearArrays = () => {
      if (processorRef.current) {
        // Clear any internal arrays/buffers the processor might have
        processorRef.current.reset();
      }
    };
    
    // Execute cleanup with small delay to ensure UI updates first
    setTimeout(clearArrays, 100);
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
