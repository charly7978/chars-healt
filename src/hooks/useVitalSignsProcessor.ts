
import { useState, useCallback } from 'react';
import { VitalSignsProcessor } from '../modules/VitalSignsProcessor';

export const useVitalSignsProcessor = () => {
  const [processor] = useState(() => new VitalSignsProcessor());
  
  const processSignal = useCallback((value: number) => {
    return processor.processSignal(value);
  }, [processor]);

  const reset = useCallback(() => {
    processor.reset();
  }, [processor]);

  return {
    processSignal,
    reset
  };
};
