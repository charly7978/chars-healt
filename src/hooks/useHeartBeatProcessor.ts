import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export const useHeartBeatProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  const [isDicroticPoint, setIsDicroticPoint] = useState(false);
  const [visualAmplitude, setVisualAmplitude] = useState(0);
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
      processorRef.current = new HeartBeatProcessor();
      // Make it globally accessible for debugging
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
      setIsDicroticPoint(result.isDicroticPoint);
      setVisualAmplitude(result.visualAmplitude);
      
      // Get RR intervals for arrhythmia detection, including amplitudes if available
      const rrData = processor.getRRIntervals();
      
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        isPeak: result.isPeak,
        isDicroticPoint: result.isDicroticPoint,
        visualAmplitude: result.visualAmplitude,
        rrData,
        arrhythmiaCount: result.arrhythmiaCount
      };
    } catch (error) {
      console.error('Error processing signal:', error);
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        isDicroticPoint: false,
        visualAmplitude: 0,
        rrData: { intervals: [], lastPeakTime: null },
        arrhythmiaCount: 0
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
    setIsDicroticPoint(false);
    setVisualAmplitude(0);
  }, []);
  
  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    return processorRef.current.getFinalBPM();
  }, []);
  
  const incrementArrhythmiaCount = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.incrementArrhythmiaCount();
    }
  }, []);
  
  const getArrhythmiaCount = useCallback(() => {
    if (!processorRef.current) return 0;
    return processorRef.current.getArrhythmiaCount();
  }, []);
  
  const cleanMemory = useCallback(() => {
    console.log('useHeartBeatProcessor: Performing memory cleanup');
    
    // Reset states
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    setIsDicroticPoint(false);
    setVisualAmplitude(0);
    
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
    isDicroticPoint,
    visualAmplitude,
    processSignal,
    reset,
    getFinalBPM,
    incrementArrhythmiaCount,
    getArrhythmiaCount,
    cleanMemory
  };
};
