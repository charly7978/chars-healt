
import { useCallback } from 'react';
import { enhancedPeakDetection } from '../../utils/signalProcessing/enhancedPeakDetection';

/**
 * Hook for advanced heart rate signal analysis
 */
export const useHeartRateAnalysis = () => {
  /**
   * Run advanced analysis on the heart rate signal
   */
  const runAdvancedAnalysis = useCallback((signalBuffer: number[]) => {
    return enhancedPeakDetection(signalBuffer);
  }, []);
  
  /**
   * Enhance a result with advanced analysis data
   */
  const enhanceResultWithAdvancedAnalysis = useCallback((result: any, advancedAnalysis: any) => {
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
      const lastSampleIndex = advancedAnalysis.buffer?.length - 1 || 0;
      result.isPeak = advancedAnalysis.peakIndices.includes(lastSampleIndex);
      
      // Provide additional cardiac metrics if available
      if (advancedAnalysis.perfusionIndex) {
        result.perfusionIndex = advancedAnalysis.perfusionIndex;
      }
      
      if (advancedAnalysis.pulsePressure) {
        result.pulsePressure = advancedAnalysis.pulsePressure;
      }
      
      return true;
    }
    return false;
  }, []);
  
  /**
   * Get final analysis from the signal buffer
   */
  const getFinalAnalysis = useCallback((signalBuffer: number[]) => {
    if (signalBuffer.length >= 150) { // At least 5 seconds of data
      const finalAnalysis = enhancedPeakDetection(signalBuffer);
      
      if (finalAnalysis.heartRate && 
          finalAnalysis.signalQuality > 70 && 
          finalAnalysis.heartRate >= 40 && 
          finalAnalysis.heartRate <= 200) {
        
        console.log(`Final cardiac analysis: HR=${finalAnalysis.heartRate}, quality=${finalAnalysis.signalQuality}%`);
        return finalAnalysis;
      }
    }
    return null;
  }, []);
  
  return {
    runAdvancedAnalysis,
    enhanceResultWithAdvancedAnalysis,
    getFinalAnalysis
  };
};
