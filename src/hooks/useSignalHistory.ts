
import { useRef } from 'react';

/**
 * Hook for managing signal history data
 */
export const useSignalHistory = () => {
  // Buffers para mantener registro de señales y resultados
  const signalHistoryRef = useRef<number[]>([]);
  const rrDataHistoryRef = useRef<Array<{ intervals: number[], lastPeakTime: number | null }>>([]);
  
  /**
   * Add signal value to history
   */
  const addSignal = (value: number) => {
    signalHistoryRef.current.push(value);
    if (signalHistoryRef.current.length > 300) {
      signalHistoryRef.current = signalHistoryRef.current.slice(-300);
    }
  };
  
  /**
   * Add RR interval data to history
   */
  const addRRData = (rrData: { intervals: number[], lastPeakTime: number | null }) => {
    rrDataHistoryRef.current.push({ ...rrData });
    if (rrDataHistoryRef.current.length > 20) {
      rrDataHistoryRef.current = rrDataHistoryRef.current.slice(-20);
    }
  };
  
  /**
   * Get signal quality estimate based on history length
   */
  const getSignalQuality = (): number => {
    return Math.min(1.0, signalHistoryRef.current.length / 100);
  };
  
  /**
   * Reset all history data
   */
  const reset = () => {
    signalHistoryRef.current = [];
    rrDataHistoryRef.current = [];
  };
  
  return {
    addSignal,
    addRRData,
    getSignalQuality,
    reset,
    signalHistory: signalHistoryRef,
    rrDataHistory: rrDataHistoryRef
  };
};
