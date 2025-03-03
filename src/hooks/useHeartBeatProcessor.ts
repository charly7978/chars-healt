import { useState, useRef, useCallback, useEffect } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';
import { HeartBeatResult } from '../types/signal';

export const useHeartBeatProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [isAndroid] = useState<boolean>(() => /android/i.test(navigator.userAgent));
  
  useEffect(() => {
    console.log('useHeartBeatProcessor: Inicializado en plataforma:', isAndroid ? 'Android' : 'Otro');
  }, [isAndroid]);
  
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
      
      // Enhanced amplitude handling - critical for arrhythmia detection
      let amplitudes = rrData.amplitudes || [];
      
      // Add current peak amplitude if it's a peak
      if (result.isPeak && result.amplitude !== undefined) {
        if (!amplitudes.length) {
          amplitudes = [];
        }
        amplitudes.push(result.amplitude);
        
        console.log("HeartBeatProcessor: Peak detected with amplitude:", result.amplitude);
      }
      
      // Ensure amplitudes array always exists, even if empty
      rrData.amplitudes = amplitudes;
      
      // Special handling for Android: ensure consistently structured RR data
      if (isAndroid && rrData.intervals.length > 0) {
        // For Android: Create dummy amplitudes if we don't have any
        if (!rrData.amplitudes || rrData.amplitudes.length === 0) {
          rrData.amplitudes = Array(rrData.intervals.length).fill(100);
        }
        
        // For Android: Ensure arrays are of same length
        if (rrData.amplitudes.length !== rrData.intervals.length) {
          // Normalize lengths by extending the shorter one
          const targetLength = Math.max(rrData.intervals.length, rrData.amplitudes.length);
          
          if (rrData.amplitudes.length < targetLength) {
            // Fill missing amplitudes with average or default value
            const avgAmp = rrData.amplitudes.reduce((sum, val) => sum + val, 0) / 
                          rrData.amplitudes.length || 100;
            
            while (rrData.amplitudes.length < targetLength) {
              rrData.amplitudes.push(avgAmp);
            }
          }
          
          if (rrData.intervals.length < targetLength) {
            // Fill missing intervals with average
            const avgInt = rrData.intervals.reduce((sum, val) => sum + val, 0) / 
                          rrData.intervals.length || 800;
            
            while (rrData.intervals.length < targetLength) {
              rrData.intervals.push(avgInt);
            }
          }
        }
        
        console.log(`useHeartBeatProcessor [ANDROID]: RR data preparado:`, {
          intervalos: rrData.intervals.length,
          amplitudes: rrData.amplitudes.length
        });
      }
      
      console.log("useHeartBeatProcessor: Processed signal", { 
        bpm: result.bpm, 
        confidence: result.confidence, 
        isPeak: result.isPeak,
        intervals: rrData.intervals.length,
        amplitudes: amplitudes.length,
        amplitude: result.amplitude,
        plataforma: isAndroid ? 'Android' : 'Otro'
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
  }, [getProcessor, isAndroid]);
  
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
