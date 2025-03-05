
import { useState, useCallback } from 'react';
import { HeartBeatResult } from '../../types/signal';
import { useHeartRateState } from './useHeartRateState';
import { useHeartRateAnalysis } from './useHeartRateAnalysis';

/**
 * Core hook for processing heart beat signals
 */
export const useHeartRateProcessor = () => {
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [isPeak, setIsPeak] = useState(false);
  
  const { 
    getProcessor,
    signalBufferRef,
    cleanMemory: cleanHeartRateState
  } = useHeartRateState();
  
  const {
    runAdvancedAnalysis,
    enhanceResultWithAdvancedAnalysis
  } = useHeartRateAnalysis();
  
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
        advancedAnalysis = runAdvancedAnalysis(signalBufferRef.current);
        
        // If advanced analysis is available, enhance the result
        if (advancedAnalysis) {
          enhanceResultWithAdvancedAnalysis(result, advancedAnalysis);
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
      };
    } catch (error) {
      console.error('Error processing signal:', error);
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        rrData: { intervals: [], lastPeakTime: null, amplitudes: [], advancedRRIntervals: [] },
        amplitude: undefined
      };
    }
  }, [getProcessor, runAdvancedAnalysis, enhanceResultWithAdvancedAnalysis]);
  
  /**
   * Clean up memory and resources
   */
  const cleanMemory = useCallback(() => {
    console.log('useHeartRateProcessor: Performing memory cleanup');
    
    // Reset states
    setBpm(0);
    setConfidence(0);
    setIsPeak(false);
    
    // Clean heart rate state
    cleanHeartRateState();
    
  }, [cleanHeartRateState]);
  
  return {
    bpm,
    confidence,
    isPeak,
    processSignal,
    cleanMemory
  };
};
