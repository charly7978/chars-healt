
import { useState, useEffect, useCallback } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const [processor] = useState(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador");
    return new PPGSignalProcessor();
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);

  useEffect(() => {
    console.log("useSignalProcessor: Configurando callbacks");
    
    processor.onSignalReady = (signal: ProcessedSignal) => {
      // Lógica simplificada: dedo detectado si el valor está en el rango negro-rojo
      const normalizedValue = signal.filteredValue;
      const isFingerDetected = normalizedValue >= 0 && normalizedValue <= 255;
      
      console.log("useSignalProcessor: Señal recibida:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue,
        isFingerDetected
      });
      
      setLastSignal({
        ...signal,
        fingerDetected: isFingerDetected
      });
      setError(null);
    };

    processor.onError = (error: ProcessingError) => {
      console.error("useSignalProcessor: Error recibido:", error);
      setError(error);
    };

    console.log("useSignalProcessor: Iniciando procesador");
    processor.initialize().catch(error => {
      console.error("useSignalProcessor: Error de inicialización:", error);
    });

    return () => {
      console.log("useSignalProcessor: Limpiando");
      processor.stop();
    };
  }, [processor]);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    setIsProcessing(true);
    processor.start();
  }, [processor]);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento");
    setIsProcessing(false);
    processor.stop();
  }, [processor]);

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Iniciando calibración");
      await processor.calibrate();
      console.log("useSignalProcessor: Calibración exitosa");
      return true;
    } catch (error) {
      console.error("useSignalProcessor: Error de calibración:", error);
      return false;
    }
  }, [processor]);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing) {
      console.log("useSignalProcessor: Procesando nuevo frame");
      processor.processFrame(imageData);
    } else {
      console.log("useSignalProcessor: Frame ignorado (no está procesando)");
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
