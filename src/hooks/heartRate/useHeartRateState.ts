
import { useRef, useCallback } from 'react';
import { HeartBeatProcessor } from '../../modules/HeartBeatProcessor';

/**
 * Hook for managing the heart rate processor and its state
 */
export const useHeartRateState = () => {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const signalBufferRef = useRef<number[]>([]);
  
  /**
   * Get the processor instance, creating it if needed
   */
  const getProcessor = useCallback(() => {
    if (!processorRef.current) {
      console.log('useHeartRateState: Creating new HeartBeatProcessor instance');
      processorRef.current = new HeartBeatProcessor();
      // Make it globally accessible for debugging
      window.heartBeatProcessor = processorRef.current;
    }
    return processorRef.current;
  }, []);
  
  /**
   * Reset the processor and all analysis data
   */
  const reset = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.reset();
    }
    signalBufferRef.current = [];
  }, []);
  
  /**
   * Get the final BPM result with high confidence
   */
  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    return processorRef.current.getFinalBPM();
  }, []);
  
  /**
   * Clean up memory and resources
   */
  const cleanMemory = useCallback(() => {
    // Reset and nullify processor
    if (processorRef.current) {
      try {
        processorRef.current.reset();
        // Remove global reference if it exists
        if (window.heartBeatProcessor === processorRef.current) {
          delete window.heartBeatProcessor;
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
    getProcessor,
    signalBufferRef,
    reset,
    getFinalBPM,
    cleanMemory
  };
};
