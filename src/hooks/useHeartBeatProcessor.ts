
import { useState, useEffect, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue?: number;
  arrhythmiaCount: number;
}

export const useHeartBeatProcessor = () => {
  const [processor] = useState(() => {
    console.log('useHeartBeatProcessor: Creando nueva instancia de HeartBeatProcessor');
    const newProcessor = new HeartBeatProcessor();
    if (typeof window !== 'undefined') {
      window.heartBeatProcessor = newProcessor;
    }
    return newProcessor;
  });
  
  const [currentBPM, setCurrentBPM] = useState(0);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('useHeartBeatProcessor: Asignando processor a window.heartBeatProcessor');
      window.heartBeatProcessor = processor;
      
      return () => {
        console.log('useHeartBeatProcessor: Limpiando processor de window');
        window.heartBeatProcessor = undefined;
      };
    }
  }, [processor]);

  const processSignal = useCallback((value: number): HeartBeatResult => {
    console.log('useHeartBeatProcessor - processSignal:', {
      inputValue: value,
      currentProcessor: !!processor,
      timestamp: new Date().toISOString()
    });

    const result = processor.processSignal(value);
    console.log('useHeartBeatProcessor - result:', {
      bpm: result.bpm,
      confidence: result.confidence,
      isPeak: result.isPeak,
      arrhythmiaCount: result.arrhythmiaCount,
      timestamp: new Date().toISOString()
    });
    
    if (result.bpm > 0) {
      setCurrentBPM(result.bpm);
      setConfidence(result.confidence);
    }

    return result;
  }, [processor]);

  const reset = useCallback(() => {
    console.log('useHeartBeatProcessor: Reseteando processor');
    processor.reset();
    setCurrentBPM(0);
    setConfidence(0);
  }, [processor]);

  return {
    currentBPM,
    confidence,
    processSignal,
    reset
  };
};
