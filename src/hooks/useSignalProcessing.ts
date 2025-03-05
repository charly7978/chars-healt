
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
 */
export const useSignalProcessing = () => {
  // Use useMemo for buffer creation to prevent recreation on re-renders
  const signalBufferRef = useRef<CircularBuffer>(
    useMemo(() => new CircularBuffer(300), []) // 10 seconds at 30fps
  );
  const rawBufferRef = useRef<number[]>([]);
  const lastAnalysisRef = useRef<{
    timestamp: number;
    cardiacAnalysis: any;
  }>({ timestamp: 0, cardiacAnalysis: null });
  
  // Cache for calculated values to reduce redundant processing
  const lastRawValueRef = useRef<number | null>(null);
  const lastEnhancedValueRef = useRef<number | null>(null);
  const analysisCooldownMs = 100; // Only perform full analysis every 100ms
  
  /**
   * Procesa la señal PPG y realiza análisis cardíaco con optimizaciones de rendimiento
   */
  const processSignal = useCallback((lastSignal: ProcessedSignal) => {
    if (!lastSignal) return null;
    
    // Performance optimization: Skip if we're processing the same raw value
    if (lastRawValueRef.current === lastSignal.rawValue) {
      return {
        enhancedValue: lastEnhancedValueRef.current,
        isPeak: false,
        quality: lastSignal.quality,
        fingerDetected: lastSignal.fingerDetected
      };
    }
    
    // Add raw value to buffer
    rawBufferRef.current.push(lastSignal.rawValue);
    if (rawBufferRef.current.length > 300) {
      // Use slice(-300) instead of multiple shift operations for better performance
      rawBufferRef.current = rawBufferRef.current.slice(-300);
    }
    
    // Cache the raw value
    lastRawValueRef.current = lastSignal.rawValue;
    
    // Enhance the signal value using cached buffer when possible
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
    
    // Not enough data or analysis performed too recently
    if (signalValues.length < 90 || timeSinceLastAnalysis < analysisCooldownMs) {
      // Return minimal processing results with cached values when possible
      return {
        enhancedValue,
        isPeak: false,
        quality: lastSignal.quality || 0,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: lastAnalysisRef.current.cardiacAnalysis
      };
    }
    
    // Choose the most appropriate algorithm based on signal characteristics
    // Only calculate these once since they're computationally expensive
    const signalMean = signalValues.reduce((sum, val) => sum + val, 0) / signalValues.length;
    const signalMin = Math.min(...signalValues);
    const signalMax = Math.max(...signalValues);
    const signalRange = signalMax - signalMin;
    
    let cardiacAnalysis;
    
    // Use enhanced peak detection for typical PPG signals
    if (signalRange / signalMean > 0.1) { // Good signal-to-noise ratio
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
    const fingerDetected = quality > 20 && lastSignal.fingerDetected;
    
    // Check if current point is a peak
    const currentIndex = signalValues.length - 1;
    const isPeak = cardiacAnalysis.peakIndices.includes(currentIndex);
    
    // Pass to heart beat processor only if we have a valid processor
    if (window.heartBeatProcessor) {
      window.heartBeatProcessor.processSignal(enhancedValue);
    }
    
    // Log cardiac analysis results only on significant changes for debugging
    if (cardiacAnalysis.heartRate && cardiacAnalysis.heartRate > 0) {
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
  }, []);

  return {
    processSignal,
    resetSignalBuffers,
    getSignalBuffer: () => signalBufferRef.current,
    getRawBuffer: () => rawBufferRef.current
  };
};
