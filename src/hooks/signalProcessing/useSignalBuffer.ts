
import { useRef, useCallback } from 'react';
import { CircularBuffer } from '../../utils/CircularBuffer';

/**
 * Hook for managing signal buffers with performance optimizations
 */
export const useSignalBuffer = () => {
  // Refs for buffer management
  const signalBufferRef = useRef<CircularBuffer | null>(null);
  const rawBufferRef = useRef<number[]>([]);
  
  /**
   * Initialize the signal buffer if not already initialized
   */
  const initializeBuffers = useCallback((bufferSize: number = 200) => {
    if (!signalBufferRef.current) {
      signalBufferRef.current = new CircularBuffer(bufferSize);
    }
  }, []);
  
  /**
   * Add a raw value to the buffer
   */
  const addToRawBuffer = useCallback((rawValue: number) => {
    rawBufferRef.current.push(rawValue);
    if (rawBufferRef.current.length > 200) {
      rawBufferRef.current = rawBufferRef.current.slice(-200);
    }
  }, []);
  
  /**
   * Add a data point to the circular buffer
   */
  const addToSignalBuffer = useCallback((dataPoint: any) => {
    if (signalBufferRef.current) {
      signalBufferRef.current.push(dataPoint);
    }
  }, []);
  
  /**
   * Reset all buffers
   */
  const resetBuffers = useCallback(() => {
    if (signalBufferRef.current) {
      signalBufferRef.current.clear();
    }
    rawBufferRef.current = [];
  }, []);
  
  return {
    initializeBuffers,
    addToRawBuffer,
    addToSignalBuffer,
    resetBuffers,
    getSignalBuffer: () => signalBufferRef.current,
    getRawBuffer: () => rawBufferRef.current
  };
};
