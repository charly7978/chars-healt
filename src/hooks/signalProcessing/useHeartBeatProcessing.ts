
import { useCallback } from 'react';

/**
 * Hook for sending data to the heart beat processor
 */
export const useHeartBeatProcessing = () => {
  /**
   * Process a signal value with the heart beat processor
   */
  const processWithHeartBeatProcessor = useCallback((enhancedValue: number) => {
    // If the heart beat processor is available (global instance), use it
    if (window.heartBeatProcessor) {
      // Only process periodically to reduce CPU usage
      if (Date.now() % 150 < 50) {
        window.heartBeatProcessor.processSignal(enhancedValue);
      }
    }
  }, []);
  
  return {
    processWithHeartBeatProcessor
  };
};
