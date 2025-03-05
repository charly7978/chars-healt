
import { useCallback } from 'react';
import { ProcessedSignal } from '../types/signal';
import { useSignalBuffer } from './signalProcessing/useSignalBuffer';
import { useSignalAnalysis } from './signalProcessing/useSignalAnalysis';
import { useHeartBeatProcessing } from './signalProcessing/useHeartBeatProcessing';

/**
 * Main hook for PPG signal processing with performance optimizations
 */
export const useSignalProcessing = () => {
  // Use the smaller, focused hooks
  const signalBuffer = useSignalBuffer();
  const signalAnalysis = useSignalAnalysis();
  const heartBeatProcessing = useHeartBeatProcessing();
  
  // Initialize buffer on first use
  signalBuffer.initializeBuffers(200);
  
  /**
   * Process the signal and perform cardiac analysis
   */
  const processSignal = useCallback((lastSignal: ProcessedSignal) => {
    if (!lastSignal) return null;
    
    // Apply throttling for performance
    if (signalAnalysis.shouldThrottleProcessing()) {
      // Return cached results on throttled frames
      return {
        enhancedValue: signalAnalysis.enhanceSignal([], 0), // Use cached value
        isPeak: false,
        quality: lastSignal.quality,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: null
      };
    }
    
    // Add to raw buffer and enhance signal
    signalBuffer.addToRawBuffer(lastSignal.rawValue);
    const enhancedValue = signalAnalysis.enhanceSignal(
      signalBuffer.getRawBuffer(),
      lastSignal.rawValue
    );
    
    // Create data point for circular buffer
    const dataPoint = {
      time: lastSignal.timestamp,
      value: enhancedValue,
      isArrhythmia: false
    };
    signalBuffer.addToSignalBuffer(dataPoint);
    
    // Get values for analysis
    const signalBufferObj = signalBuffer.getSignalBuffer();
    if (!signalBufferObj) {
      return {
        enhancedValue,
        isPeak: false,
        quality: lastSignal.quality || 0,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: null
      };
    }
    
    const signalValues = signalBufferObj.getPoints().map(p => p.value);
    
    // Skip cardiac analysis if we don't have enough data
    if (signalValues.length < 60) {
      return {
        enhancedValue,
        isPeak: false,
        quality: lastSignal.quality || 0,
        fingerDetected: lastSignal.fingerDetected,
        cardiacAnalysis: null
      };
    }
    
    // Perform cardiac analysis
    const cardiacAnalysis = signalAnalysis.performCardiacAnalysis(signalValues);
    
    // Extract metadata from analysis
    const quality = cardiacAnalysis.signalQuality;
    const fingerDetected = quality > 15 && lastSignal.fingerDetected;
    
    // Check if current point is a peak
    const currentIndex = signalValues.length - 1;
    const isPeak = cardiacAnalysis.peakIndices.includes(currentIndex);
    
    // Process with heart beat processor if needed
    heartBeatProcessing.processWithHeartBeatProcessor(enhancedValue);
    
    return {
      enhancedValue,
      isPeak,
      quality,
      fingerDetected,
      cardiacAnalysis
    };
  }, [signalBuffer, signalAnalysis, heartBeatProcessing]);

  /**
   * Reset all buffers and analysis state
   */
  const resetSignalBuffers = useCallback(() => {
    signalBuffer.resetBuffers();
    signalAnalysis.resetAnalysis();
  }, [signalBuffer, signalAnalysis]);

  return {
    processSignal,
    resetSignalBuffers,
    getSignalBuffer: signalBuffer.getSignalBuffer,
    getRawBuffer: signalBuffer.getRawBuffer
  };
};
