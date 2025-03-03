import { useRef, useCallback } from 'react';

export const useSignalHistory = () => {
  const signalHistory = useRef<number[]>([]);
  const rrDataHistory = useRef<{ intervals: number[], lastPeakTime: number | null, timestamp: number }[]>([]);
  const maxHistorySize = 300; // Store up to 5 seconds at 60fps

  const addSignal = useCallback((value: number) => {
    signalHistory.current.push(value);
    
    // Trim the history if it gets too long
    if (signalHistory.current.length > maxHistorySize) {
      signalHistory.current = signalHistory.current.slice(-maxHistorySize);
    }
  }, []);

  const addRRData = useCallback((rrData: { intervals: number[], lastPeakTime: number | null }) => {
    rrDataHistory.current.push({
      ...rrData,
      timestamp: Date.now()
    });
    
    // Keep only the last 20 RR intervals
    if (rrDataHistory.current.length > 20) {
      rrDataHistory.current = rrDataHistory.current.slice(-20);
    }
  }, []);
  
  const getSignalQuality = useCallback(() => {
    if (signalHistory.current.length < 10) return 0;
    
    // Calculate signal quality based on recent values
    const recentValues = signalHistory.current.slice(-60);
    
    // Use signal amplitude as a quality metric
    const min = Math.min(...recentValues);
    const max = Math.max(...recentValues);
    const amplitude = max - min;
    
    // Normalize to 0-100 range
    const normalizedQuality = Math.min(100, Math.max(0, amplitude * 50));
    
    return normalizedQuality;
  }, []);
  
  // Method to get recent signals (used for SpO2, glucose, etc.)
  const getRecentSignals = useCallback((count: number) => {
    if (signalHistory.current.length === 0) return [];
    return signalHistory.current.slice(-Math.min(count, signalHistory.current.length));
  }, []);
  
  // Method to get all available signals
  const getRawSignals = useCallback(() => {
    return [...signalHistory.current];
  }, []);
  
  const reset = useCallback(() => {
    signalHistory.current = [];
    rrDataHistory.current = [];
  }, []);

  return {
    addSignal,
    addRRData,
    getSignalQuality,
    getRecentSignals,
    getRawSignals,
    reset,
    signalHistory,
    rrDataHistory
  };
};
