
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  
  const processSignal = useCallback((value: number, rrData?: { intervals: number[], lastPeakTime: number | null }) => {
    return processor.processSignal(value, rrData); // Pasamos los datos RR al processor
  }, [processor]);

  const reset = useCallback(() => {
    processor.reset();
  }, [processor]);

  return {
    processSignal,
    reset
  };
};
