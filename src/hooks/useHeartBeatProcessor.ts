
import { useState, useCallback } from 'react';
import { HeartBeatResult } from '../types/signal';
import { useHeartRateProcessor } from './heartRate/useHeartRateProcessor';
import { useHeartRateState } from './heartRate/useHeartRateState';
import { useHeartRateAnalysis } from './heartRate/useHeartRateAnalysis';

/**
 * Custom hook for processing heart beat signals using advanced algorithms
 */
export const useHeartBeatProcessor = () => {
  const heartRateProcessor = useHeartRateProcessor();
  const { reset: resetHeartRateState, getFinalBPM: getHeartRateFinalBPM } = useHeartRateState();
  const { getFinalAnalysis } = useHeartRateAnalysis();
  
  /**
   * Process a single signal value using advanced cardiac analysis algorithms
   */
  const processSignal = useCallback((value: number) => {
    return heartRateProcessor.processSignal(value);
  }, [heartRateProcessor]);
  
  /**
   * Reset the processor and all analysis data
   */
  const reset = useCallback(() => {
    resetHeartRateState();
  }, [resetHeartRateState]);
  
  /**
   * Get the final BPM result with high confidence
   */
  const getFinalBPM = useCallback(() => {
    return getHeartRateFinalBPM();
  }, [getHeartRateFinalBPM]);
  
  /**
   * Clean up memory and resources
   */
  const cleanMemory = useCallback(() => {
    heartRateProcessor.cleanMemory();
  }, [heartRateProcessor]);
  
  return {
    bpm: heartRateProcessor.bpm,
    confidence: heartRateProcessor.confidence,
    isPeak: heartRateProcessor.isPeak,
    processSignal,
    reset,
    getFinalBPM,
    cleanMemory
  };
};
