
import { useRef, useCallback } from 'react';
import { 
  conditionPPGSignal, 
  enhancedPeakDetection, 
  panTompkinsAdaptedForPPG
} from '../../utils/signalProcessing';

/**
 * Hook for analyzing signal data and performing cardiac analysis
 */
export const useSignalAnalysis = () => {
  // Refs for performance optimization
  const lastAnalysisRef = useRef<{
    timestamp: number;
    cardiacAnalysis: any;
  }>({ timestamp: 0, cardiacAnalysis: null });
  
  const lastRawValueRef = useRef<number | null>(null);
  const lastEnhancedValueRef = useRef<number | null>(null);
  const processingThrottleRef = useRef<number>(0);
  
  /**
   * Condition the PPG signal for better analysis
   */
  const enhanceSignal = useCallback((rawBuffer: number[], rawValue: number) => {
    // Skip if the raw value hasn't changed (performance optimization)
    if (lastRawValueRef.current === rawValue) {
      return lastEnhancedValueRef.current;
    }
    
    // Save the raw value for future comparison
    lastRawValueRef.current = rawValue;
    
    // Condition the signal
    const enhancedValue = conditionPPGSignal(rawBuffer, rawValue);
    lastEnhancedValueRef.current = enhancedValue;
    
    return enhancedValue;
  }, []);
  
  /**
   * Perform cardiac analysis based on signal quality
   */
  const performCardiacAnalysis = useCallback((signalValues: number[], analysisCooldownMs: number = 350) => {
    const now = Date.now();
    const timeSinceLastAnalysis = now - lastAnalysisRef.current.timestamp;
    
    // Skip if we analyzed recently (performance optimization)
    if (timeSinceLastAnalysis < analysisCooldownMs) {
      return lastAnalysisRef.current.cardiacAnalysis;
    }
    
    // Quick variance estimation to select appropriate algorithm
    const recentValues = signalValues.slice(-20);
    const variance = Math.max(...recentValues) - Math.min(...recentValues);
    
    // Choose algorithm based on signal quality
    let cardiacAnalysis;
    if (variance > 4) {
      cardiacAnalysis = enhancedPeakDetection(signalValues);
    } else {
      cardiacAnalysis = panTompkinsAdaptedForPPG(signalValues);
    }
    
    // Cache the results
    lastAnalysisRef.current = {
      timestamp: now,
      cardiacAnalysis
    };
    
    // Reduce logging frequency
    if (cardiacAnalysis.heartRate && cardiacAnalysis.heartRate > 0 && now % 3000 < 100) {
      console.log(`Cardiac analysis: HR=${cardiacAnalysis.heartRate}, quality=${cardiacAnalysis.signalQuality}%`);
    }
    
    return cardiacAnalysis;
  }, []);
  
  /**
   * Reset analysis cache and throttling
   */
  const resetAnalysis = useCallback(() => {
    lastAnalysisRef.current = { timestamp: 0, cardiacAnalysis: null };
    lastRawValueRef.current = null;
    lastEnhancedValueRef.current = null;
    processingThrottleRef.current = 0;
  }, []);
  
  return {
    enhanceSignal,
    performCardiacAnalysis,
    resetAnalysis,
    shouldThrottleProcessing: () => {
      // Increment and check throttle counter
      processingThrottleRef.current = (processingThrottleRef.current + 1) % 3;
      return processingThrottleRef.current !== 0;
    }
  };
};
