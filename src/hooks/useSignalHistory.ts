
import { useRef } from 'react';

/**
 * Hook for managing signal history data
 */
export const useSignalHistory = () => {
  // Buffers para mantener registro de señales y resultados
  const signalHistoryRef = useRef<number[]>([]);
  const rrDataHistoryRef = useRef<Array<{ intervals: number[], lastPeakTime: number | null }>>([]);
  const signalQualityHistoryRef = useRef<number[]>([]); // Signal quality history
  
  /**
   * Add signal value to history
   */
  const addSignal = (value: number) => {
    signalHistoryRef.current.push(value);
    if (signalHistoryRef.current.length > 300) {
      signalHistoryRef.current = signalHistoryRef.current.slice(-300);
    }
    
    // Calculate and save signal quality
    const currentQuality = Math.min(1.0, signalHistoryRef.current.length / 100);
    signalQualityHistoryRef.current.push(currentQuality);
    if (signalQualityHistoryRef.current.length > 15) {
      signalQualityHistoryRef.current.shift();
    }
  };
  
  /**
   * Add RR interval data to history
   */
  const addRRData = (rrData: { intervals: number[], lastPeakTime: number | null }) => {
    // Filter outliers before saving
    const validIntervals = rrData.intervals.filter(interval => {
      // Basic physiological validity criteria for RR
      return interval >= 350 && interval <= 1800; // Valid range for 33-170 BPM
    });
    
    if (validIntervals.length > 0) {
      rrDataHistoryRef.current.push({ 
        intervals: [...validIntervals], 
        lastPeakTime: rrData.lastPeakTime 
      });
      
      if (rrDataHistoryRef.current.length > 20) {
        rrDataHistoryRef.current = rrDataHistoryRef.current.slice(-20);
      }
    }
  };
  
  /**
   * Get signal quality estimate based on history length and stability
   */
  const getSignalQuality = (): number => {
    // Weighted average of recent quality (gives more weight to recent measurements)
    if (signalQualityHistoryRef.current.length === 0) {
      return Math.min(1.0, signalHistoryRef.current.length / 100);
    }
    
    // Calculate weighted average of last 15 quality measurements
    let totalWeight = 0;
    let weightedSum = 0;
    
    signalQualityHistoryRef.current.forEach((quality, index) => {
      // Weight increases with index to give more importance to recent samples
      const weight = index + 1;
      weightedSum += quality * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  };
  
  /**
   * Reset all history data
   */
  const reset = () => {
    signalHistoryRef.current = [];
    rrDataHistoryRef.current = [];
    signalQualityHistoryRef.current = [];
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
