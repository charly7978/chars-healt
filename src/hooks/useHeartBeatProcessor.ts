
import { useState, useEffect, useCallback, useRef } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue?: number;
  arrhythmiaCount: number;
  rrData?: {
    intervals: number[];
    lastPeakTime: number | null;
    rmssd?: number;
    rrVariation?: number;
  };
}

export const useHeartBeatProcessor = () => {
  const processorRef = useRef<HeartBeatProcessor | null>(null);
  const [currentBPM, setCurrentBPM] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);

  useEffect(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
    processorRef.current = new HeartBeatProcessor();
    
    if (typeof window !== 'undefined') {
      (window as any).heartBeatProcessor = processorRef.current;
    }

    return () => {
      console.log('useHeartBeatProcessor: Limpiando processor');
      if (processorRef.current) {
        processorRef.current = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).heartBeatProcessor = undefined;
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
        rrData: {
          intervals: [],
          lastPeakTime: null,
          rmssd: 0,
          rrVariation: 0
        }
      };
    }

    console.log('useHeartBeatProcessor - processSignal:', {
      inputValue: value,
      currentProcessor: !!processorRef.current,
      timestamp: new Date().toISOString()
    });

    const result = processorRef.current.processSignal(value);
    const rrData = processorRef.current.getRRIntervals();

    // Añadir propiedades rmssd y rrVariation a rrData
    const enhancedRRData = {
      ...rrData,
      rmssd: 0,
      rrVariation: 0
    };

    // Calcular RMSSD y rrVariation si hay suficientes intervalos
    if (rrData.intervals.length >= 3) {
      let sumSquaredDiff = 0;
      for (let i = 1; i < rrData.intervals.length; i++) {
        const diff = rrData.intervals[i] - rrData.intervals[i-1];
        sumSquaredDiff += diff * diff;
      }
      
      enhancedRRData.rmssd = Math.sqrt(sumSquaredDiff / (rrData.intervals.length - 1));
      
      const avgRR = rrData.intervals.reduce((a, b) => a + b, 0) / rrData.intervals.length;
      const lastRR = rrData.intervals[rrData.intervals.length - 1];
      enhancedRRData.rrVariation = Math.abs(lastRR - avgRR) / avgRR;
    }

    console.log('useHeartBeatProcessor - result:', {
      bpm: result.bpm,
      confidence: result.confidence,
      isPeak: result.isPeak,
      arrhythmiaCount: result.arrhythmiaCount,
      rrIntervals: enhancedRRData,
      timestamp: new Date().toISOString()
    });
    
    if (result.bpm > 0) {
      setCurrentBPM(result.bpm);
      setConfidence(result.confidence);
    }

    return {
      ...result,
      rrData: enhancedRRData
    };
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
    reset
  };
};
