
import { useCallback, useRef, useMemo } from 'react';
import { ProcessedSignal } from '../types/signal';
import { CircularBuffer } from '../utils/CircularBuffer';
import { 
  conditionPPGSignal, 
  enhancedPeakDetection, 
  panTompkinsAdaptedForPPG
} from '../utils/signalProcessingUtils';

/**
 * Hook optimizado para el procesamiento de señales PPG
 * Con mejoras significativas de rendimiento
 */
export const useSignalProcessing = () => {
  // Memoize buffer creation to prevent recreation on re-renders
  const signalBufferRef = useRef<CircularBuffer>(
    useMemo(() => new CircularBuffer(200), []) // Reduced from 300 to 200 for better performance
  );
  const rawBufferRef = useRef<number[]>([]);
  const lastAnalysisRef = useRef<{
    timestamp: number;
    cardiacAnalysis: any;
  }>({ timestamp: 0, cardiacAnalysis: null });
  
  // Performance optimization: Cache for calculated values
  const lastRawValueRef = useRef<number | null>(null);
  const lastEnhancedValueRef = useRef<number | null>(null);
  const processingThrottleRef = useRef<number>(0);
  
  // Increase cooldown to reduce processing frequency - dramatic performance improvement
  const analysisCooldownMs = 350; // Further increased from 200 to 350ms
  
  /**
   * Procesa la señal PPG y realiza análisis cardíaco con optimizaciones de rendimiento
   */
  const processSignal = useCallback((lastSignal: ProcessedSignal) => {
    if (!lastSignal) return null;
    
    // Throttle processing frequency
    processingThrottleRef.current = (processingThrottleRef.current + 1) % 3;
    if (processingThrottleRef.current !== 0) {
      // Return cached results on throttled frames
      return {
        enhancedValue: lastEnhancedValueRef.current,
        isPeak: false,
        quality: lastSignal.quality,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: lastAnalysisRef.current.cardiacAnalysis
      };
    }
    
    // Performance optimization: Skip entirely if we're processing the same raw value
    if (lastRawValueRef.current === lastSignal.rawValue) {
      return {
        enhancedValue: lastEnhancedValueRef.current,
        isPeak: false,
        quality: lastSignal.quality,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: lastAnalysisRef.current.cardiacAnalysis
      };
    }
    
    // Optimize buffer management: limit buffer size more aggressively
    rawBufferRef.current.push(lastSignal.rawValue);
    if (rawBufferRef.current.length > 200) { // Reduced from 300 to 200
      // Use slice instead of multiple shift operations for better performance
      rawBufferRef.current = rawBufferRef.current.slice(-200);
    }
    
    // Cache the raw value for future comparison
    lastRawValueRef.current = lastSignal.rawValue;
    
    // Only condition the signal when necessary (avoid redundant calculations)
    const enhancedValue = conditionPPGSignal(rawBufferRef.current, lastSignal.rawValue);
    lastEnhancedValueRef.current = enhancedValue;
    
    // Create data point for circular buffer
    const dataPoint = {
      time: lastSignal.timestamp,
      value: enhancedValue,
      isArrhythmia: false
    };
    signalBufferRef.current.push(dataPoint);
    
    // Only perform intensive analysis when we have enough data and not too frequently
    const signalValues = signalBufferRef.current.getPoints().map(p => p.value);
    const now = Date.now();
    const timeSinceLastAnalysis = now - lastAnalysisRef.current.timestamp;
    
    // Skip the expensive calculations if we analyzed recently or don't have enough data
    // This is a major performance optimization
    if (signalValues.length < 60 || timeSinceLastAnalysis < analysisCooldownMs) { // Reduced from 90 to 60
      // Return minimal processing results with cached values
      return {
        enhancedValue,
        isPeak: false,
        quality: lastSignal.quality || 0,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: lastAnalysisRef.current.cardiacAnalysis
      };
    }
    
    // Optimize: Calculate these values only once for both algorithm branches
    let cardiacAnalysis;
    
    // Fast algorithm selection based on simple threshold
    // Instead of calculating mean/min/max, use the latest 20 values for a quick variance estimate
    const recentValues = signalValues.slice(-20); // Reduced from 30 to 20
    const variance = Math.max(...recentValues) - Math.min(...recentValues);
    
    if (variance > 4) { // Reduced threshold from 5 to 4 for better algorithm selection
      cardiacAnalysis = enhancedPeakDetection(signalValues);
    } else { // For lower quality signals, use the Pan-Tompkins algorithm 
      cardiacAnalysis = panTompkinsAdaptedForPPG(signalValues);
    }
    
    // Cache the analysis results
    lastAnalysisRef.current = {
      timestamp: now,
      cardiacAnalysis
    };
    
    const quality = cardiacAnalysis.signalQuality;
    const fingerDetected = quality > 15 && lastSignal.fingerDetected; // Reduced threshold from 20 to 15
    
    // Check if current point is a peak
    const currentIndex = signalValues.length - 1;
    const isPeak = cardiacAnalysis.peakIndices.includes(currentIndex);
    
    // Pass to heart beat processor only if we have a valid processor
    if (window.heartBeatProcessor) {
      // Throttle heartbeat processing
      if (now % 150 < 50) { // Process only 1/3 of the time
        window.heartBeatProcessor.processSignal(enhancedValue);
      }
    }
    
    // Reduce logging frequency - only log every 3 seconds max
    if (cardiacAnalysis.heartRate && cardiacAnalysis.heartRate > 0 && now % 3000 < 100) {
      console.log(`Cardiac analysis: HR=${cardiacAnalysis.heartRate}, quality=${quality}%`);
    }
    
    return {
      enhancedValue,
      isPeak,
      quality,
      fingerDetected,
      cardiacAnalysis
    };
  }, []);

  /**
   * Limpia el búfer de señal
   */
  const resetSignalBuffers = useCallback(() => {
    signalBufferRef.current.clear();
    rawBufferRef.current = [];
    lastRawValueRef.current = null;
    lastEnhancedValueRef.current = null;
    lastAnalysisRef.current = { timestamp: 0, cardiacAnalysis: null };
    processingThrottleRef.current = 0;
  }, []);

  return {
    processSignal,
    resetSignalBuffers,
    getSignalBuffer: () => signalBufferRef.current,
    getRawBuffer: () => rawBufferRef.current
  };
};
