
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
      
      // Get RR intervals and store amplitude for arrhythmia detection
      const rrIntervals = processor.getRRIntervals().intervals;
      const lastPeakTime = result.isPeak ? Date.now() : null;
      
      // Create array of amplitudes for arrhythmia detection
      // This is critical for the arrhythmia detection algorithm
      let amplitudes: number[] = [];
      
      // Get amplitudes from processor if available
      const processorAmplitudes = processor.getRRIntervals().amplitudes || [];
      if (processorAmplitudes && processorAmplitudes.length > 0) {
        amplitudes = [...processorAmplitudes];
      }
      
      // Add current peak amplitude if it's a peak
      if (result.isPeak && result.amplitude !== undefined) {
        amplitudes.push(result.amplitude);
        console.log("HeartBeatProcessor: Peak detected with amplitude:", result.amplitude);
      }
      
      // Ensure we have at least one amplitude value for each RR interval
      if (rrIntervals.length > amplitudes.length) {
        // Fill missing amplitudes with estimated values
        const missingCount = rrIntervals.length - amplitudes.length;
        const estimatedAmplitude = 100 * (confidence / 100);
        for (let i = 0; i < missingCount; i++) {
          amplitudes.push(estimatedAmplitude);
        }
      }
      
      console.log("useHeartBeatProcessor: Processed signal", { 
        bpm: result.bpm, 
        confidence: result.confidence, 
        isPeak: result.isPeak,
        intervals: rrIntervals.length,
        amplitudes: amplitudes.length
      });
      
      // Enhanced data structure with all necessary information
      const rrData = {
        intervals: rrIntervals,
        lastPeakTime: lastPeakTime,
        amplitudes: amplitudes
      };
      
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
