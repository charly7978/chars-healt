import { useState, useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';
import { HeartBeatResult } from '../types/signal';
import { panTompkinsAdaptedForPPG, enhancedPeakDetection } from '../utils/signalProcessingUtils';

/**
 * Custom hook for processing heart beat signals using advanced algorithms
 */
export const useHeartBeatProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const signalBufferRef = useRef<number[]>([]);
  
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useHeartBeatProcessor: Creating new HeartBeatProcessor instance');
      processorRef.current = new HeartBeatProcessor();
      // Make it globally accessible for debugging
      if (window) {
        (window as any).heartBeatProcessor = processorRef.current;
      }
    }
    return processorRef.current;
  }, []);
  
  /**
   * Process a single signal value using advanced cardiac analysis algorithms
   */
  const processSignal = useCallback((value: number) => {
    try {
      // Get the main processor
      const processor = getProcessor();
      
      // Store the signal value in our buffer for advanced analysis
      signalBufferRef.current.push(value);
      if (signalBufferRef.current.length > 300) { // 10 seconds at 30fps
        signalBufferRef.current = signalBufferRef.current.slice(-300);
      }
      
      // Process with the core HeartBeatProcessor (maintains compatibility)
      const result = processor.processSignal(value);
      
      // Also run the signal through our advanced cardiac analysis
      // if we have enough data (at least 3 seconds at 30fps)
      let advancedAnalysis = null;
      if (signalBufferRef.current.length >= 90) {
        advancedAnalysis = enhancedPeakDetection(signalBufferRef.current);
        
        // If the advanced algorithm found peaks and has a higher confidence,
        // prioritize its heart rate measurement
        if (advancedAnalysis.heartRate && 
            advancedAnalysis.signalQuality > result.confidence &&
            advancedAnalysis.heartRate >= 40 && 
            advancedAnalysis.heartRate <= 200) {
          
          console.log(`Advanced cardiac algorithm detected HR: ${advancedAnalysis.heartRate}, quality: ${advancedAnalysis.signalQuality}%`);
          
          // Use the advanced heart rate if it's valid and of higher quality
          result.bpm = advancedAnalysis.heartRate;
          result.confidence = advancedAnalysis.signalQuality;
          
          // Also check if the current sample is a peak according to advanced algorithm
          const lastSampleIndex = signalBufferRef.current.length - 1;
          result.isPeak = advancedAnalysis.peakIndices.includes(lastSampleIndex);
          
          // Provide additional cardiac metrics if available
          if (advancedAnalysis.perfusionIndex) {
            result.perfusionIndex = advancedAnalysis.perfusionIndex;
          }
          
          if (advancedAnalysis.pulsePressure) {
            result.pulsePressure = advancedAnalysis.pulsePressure;
          }
        }
      }
      
      // Update state with the latest results
      setBpm(result.bpm);
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
      
      // Create a copy of rrData that includes advancedRRIntervals if available
      const enhancedRRData = {
        ...rrData,
        advancedRRIntervals: advancedAnalysis?.rrIntervals || []
      };
      
      return {
        bpm: result.bpm,
        confidence: result.confidence,
        isPeak: result.isPeak,
        rrData: enhancedRRData,
        amplitude: result.amplitude,
        perfusionIndex: result.perfusionIndex || (advancedAnalysis?.perfusionIndex || 0),
        pulsePressure: result.pulsePressure || (advancedAnalysis?.pulsePressure || 0)
      } as HeartBeatResult;
    } catch (error) {
      console.error('Error processing signal:', error);
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        rrData: { intervals: [], lastPeakTime: null, amplitudes: [], advancedRRIntervals: [] },
        amplitude: undefined
      } as HeartBeatResult;
    }
  }, [getProcessor]);
  
  /**
   * Reset the processor and all analysis data
   */
  const reset = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.reset();
        // Remove global reference if it exists
        if (window && (window as any).heartBeatProcessor === processorRef.current) {
          delete (window as any).heartBeatProcessor;
        }
      } catch (error) {
        console.error('Error cleaning HeartBeatProcessor memory:', error);
      }
    }
    signalBufferRef.current = [];
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
  }, []);
  
  /**
   * Get the final BPM result with high confidence
   */
  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    
    // Run final advanced analysis on the entire signal buffer
    if (signalBufferRef.current.length >= 150) { // At least 5 seconds of data
      const finalAnalysis = enhancedPeakDetection(signalBufferRef.current);
      
      if (finalAnalysis.heartRate && 
          finalAnalysis.signalQuality > 70 && 
          finalAnalysis.heartRate >= 40 && 
          finalAnalysis.heartRate <= 200) {
        
        console.log(`Final cardiac analysis: HR=${finalAnalysis.heartRate}, quality=${finalAnalysis.signalQuality}%`);
        return finalAnalysis.heartRate;
      }
    }
    
    // Fall back to the original processor's result if advanced analysis is unavailable
    return processorRef.current.getFinalBPM();
  }, []);
  
  /**
   * Clean up memory and resources
   */
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
        if (window && (window as any).heartBeatProcessor === processorRef.current) {
          delete (window as any).heartBeatProcessor;
        }
      } catch (error) {
        console.error('Error cleaning HeartBeatProcessor memory:', error);
      }
    }
    
    // Clear the reference
    processorRef.current = null;
    
    // Clear signal buffer
    signalBufferRef.current = [];
    
    // Force additional garbage collection if available
    if (window.gc) {
      try {
        window.gc();
      } catch (e) {
        console.log("GC not available in this environment");
      }
    }
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
