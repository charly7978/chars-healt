
import { useState, useEffect, useCallback } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const [processor] = useState(() => new PPGSignalProcessor());
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);

  useEffect(() => {
    processor.onSignalReady = (signal: ProcessedSignal) => {
      console.log("Signal quality:", signal.quality);
      setLastSignal(signal);
      setError(null);
    };

    processor.onError = (error: ProcessingError) => {
      console.error("Signal processing error:", error);
      setError(error);
    };

    processor.initialize().catch(error => {
      console.error("Error initializing signal processor:", error);
    });

    return () => {
      processor.stop();
    };
  }, [processor]);

  const startProcessing = useCallback(() => {
    setIsProcessing(true);
    processor.start();
  }, [processor]);

  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    processor.stop();
  }, [processor]);

  const calibrate = useCallback(async () => {
    try {
      await processor.calibrate();
      return true;
    } catch (error) {
      console.error("Calibration error:", error);
      return false;
    }
  }, [processor]);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing) {
      processor.processFrame(imageData);
    }
  }, [isProcessing, processor]);

  return {
    isProcessing,
    lastSignal,
    error,
    startProcessing,
    stopProcessing,
    calibrate,
    processFrame
  };
};
