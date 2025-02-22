
import { useState, useEffect, useCallback } from 'react';
import { HeartBeatProcessor } from '../modules/HeartBeatProcessor';

export const useHeartBeatProcessor = () => {
  const [processor] = useState(() => {
    const newProcessor = new HeartBeatProcessor();
    // Asignamos el procesador a window para que esté disponible globalmente
    window.heartBeatProcessor = newProcessor;
    return newProcessor;
  });
  const [currentBPM, setCurrentBPM] = useState(0);
  const [confidence, setConfidence] = useState(0);

  const processSignal = useCallback((value: number) => {
    const result = processor.processSignal(value);
    
    if (result.bpm > 0) {
      setCurrentBPM(result.bpm);
      setConfidence(result.confidence);
    }
  }, [processor]);

  const reset = useCallback(() => {
    processor.reset();
    setCurrentBPM(0);
    setConfidence(0);
  }, [processor]);

  // Limpiamos el procesador global cuando el componente se desmonta
  useEffect(() => {
    return () => {
      window.heartBeatProcessor = undefined;
    };
  }, []);

  return {
    currentBPM,
    confidence,
    processSignal,
    reset
  };
};
