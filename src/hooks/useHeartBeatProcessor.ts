
import { useState, useEffect, useCallback, useRef } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue?: number;
  arrhythmiaCount: number;
}

export const useHeartBeatProcessor = () => {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [currentBPM, setCurrentBPM] = useState(0);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
    processorRef.current = new HeartBeatProcessor();
    
    if (typeof window !== 'undefined') {
      window.heartBeatProcessor = processorRef.current;
    }

    return () => {
      console.log('useHeartBeatProcessor: Limpiando processor');
      if (processorRef.current) {
        processorRef.current = null;
      }
      if (typeof window !== 'undefined') {
        window.heartBeatProcessor = undefined;
      }
    };
  }, []);

  const processSignal = useCallback((value: number): HeartBeatResult => {
    if (!processorRef.current) {
      console.warn('useHeartBeatProcessor: Processor no inicializado');
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        arrhythmiaCount: 0,
      };
    }

    console.log('useHeartBeatProcessor - processSignal:', {
      inputValue: value,
      currentProcessor: !!processorRef.current,
      timestamp: new Date().toISOString()
    });

    const result = processorRef.current.processSignal(value);
    
    if (result.bpm > 0) {
      setCurrentBPM(result.bpm);
      setConfidence(result.confidence);
    }

    return result;
  }, []);

  const getFinalBPM = useCallback(() => {
    if (!processorRef.current) return 0;
    return processorRef.current.getFinalBPM();
  }, []);

  const getRRIntervals = useCallback(() => {
    if (!processorRef.current) {
      return {
        intervals: [],
        lastPeakTime: null
      };
    }
    return processorRef.current.getRRIntervals();
  }, []);

  const reset = useCallback(() => {
    console.log('useHeartBeatProcessor: Reseteando processor');
    if (processorRef.current) {
      processorRef.current.reset();
    }
    setCurrentBPM(0);
    setConfidence(0);
  }, []);

  return {
    currentBPM,
    confidence,
    processSignal,
    reset,
    getFinalBPM,
    getRRIntervals
  };
};
