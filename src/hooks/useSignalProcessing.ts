
import { useCallback, useRef } from 'react';
import { ProcessedSignal } from '../types/signal';
import { CircularBuffer } from '../utils/CircularBuffer';
import { 
  conditionPPGSignal, 
  enhancedPeakDetection, 
  panTompkinsAdaptedForPPG
} from '../utils/signalProcessingUtils';

/**
 * Hook para el procesamiento de señales PPG
 */
export const useSignalProcessing = () => {
  const signalBufferRef = useRef<CircularBuffer>(new CircularBuffer(300)); // 10 seconds at 30fps
  const rawBufferRef = useRef<number[]>([]);
  
  /**
   * Procesa la señal PPG y realiza análisis cardíaco
   */
  const processSignal = useCallback((lastSignal: ProcessedSignal) => {
    if (!lastSignal) return null;
    
    // Add raw value to buffer
    rawBufferRef.current.push(lastSignal.rawValue);
    if (rawBufferRef.current.length > 300) {
      rawBufferRef.current = rawBufferRef.current.slice(-300);
    }
    
    // Enhance the signal value
    const enhancedValue = conditionPPGSignal(rawBufferRef.current, lastSignal.rawValue);
    
    // Create data point for circular buffer
    const dataPoint = {
      time: lastSignal.timestamp,
      value: enhancedValue,
      isArrhythmia: false
    };
    signalBufferRef.current.push(dataPoint);
    
    // Get signal values for cardiac analysis
    const signalValues = signalBufferRef.current.getPoints().map(p => p.value);
    
    if (signalValues.length < 90) {
      // Not enough data for analysis yet
      return {
        enhancedValue,
        isPeak: false,
        quality: 0,
        fingerDetected: lastSignal.fingerDetected
      };
    }
    
    // Choose the most appropriate algorithm based on signal characteristics
    const signalMean = signalValues.reduce((sum, val) => sum + val, 0) / signalValues.length;
    const signalMax = Math.max(...signalValues);
    const signalMin = Math.min(...signalValues);
    const signalRange = signalMax - signalMin;
    
    let cardiacAnalysis;
    
    // Use enhanced peak detection for typical PPG signals
    if (signalRange / signalMean > 0.1) { // Good signal-to-noise ratio
      cardiacAnalysis = enhancedPeakDetection(signalValues);
    } else { // For lower quality signals, use the Pan-Tompkins algorithm 
      cardiacAnalysis = panTompkinsAdaptedForPPG(signalValues);
    }
    
    const quality = cardiacAnalysis.signalQuality;
    const fingerDetected = quality > 20 && lastSignal.fingerDetected;
    
    // Check if current point is a peak
    const currentIndex = signalValues.length - 1;
    const isPeak = cardiacAnalysis.peakIndices.includes(currentIndex);
    
    // Pass to heart beat processor if available
    if (window.heartBeatProcessor) {
      window.heartBeatProcessor.processSignal(enhancedValue);
    }
    
    // Log cardiac analysis results for debugging
    if (cardiacAnalysis.heartRate) {
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
  }, []);

  return {
    processSignal,
    resetSignalBuffers,
    getSignalBuffer: () => signalBufferRef.current,
    getRawBuffer: () => rawBufferRef.current
  };
};
