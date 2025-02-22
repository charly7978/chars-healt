
import { useState, useEffect, useCallback } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';
import { useToast } from './use-toast';

export const useSignalProcessor = () => {
  const [processor] = useState(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador");
    return new PPGSignalProcessor();
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameTime, setLastFrameTime] = useState(Date.now());
  const { toast } = useToast();

  useEffect(() => {
    console.log("useSignalProcessor: Configurando callbacks");
    
    processor.onSignalReady = (signal: ProcessedSignal) => {
      const now = Date.now();
      const frameTime = now - lastFrameTime;
      setLastFrameTime(now);
      
      console.log("useSignalProcessor: Señal recibida:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue,
        frameTime,
        frameCount: frameCount + 1
      });
      
      setFrameCount(prev => prev + 1);
      setLastSignal(signal);
      setError(null);
    };

    processor.onError = (error: ProcessingError) => {
      console.error("useSignalProcessor: Error recibido:", error);
      setError(error);
      toast({
        title: "Error en el procesamiento",
        description: error.message,
        variant: "destructive"
      });
    };

    console.log("useSignalProcessor: Iniciando procesador");
    processor.initialize().catch(error => {
      console.error("useSignalProcessor: Error de inicialización:", error);
      toast({
        title: "Error de inicialización",
        description: "No se pudo inicializar el procesador de señal",
        variant: "destructive"
      });
    });

    return () => {
      console.log("useSignalProcessor: Limpiando");
      processor.stop();
    };
  }, [processor, frameCount, lastFrameTime, toast]);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    setIsProcessing(true);
    setFrameCount(0);
    setLastFrameTime(Date.now());
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
      toast({
        title: "Error de calibración",
        description: "No se pudo calibrar el procesador",
        variant: "destructive"
      });
      return false;
    }
  }, [processor, toast]);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing) {
      const now = Date.now();
      console.log("useSignalProcessor: Procesando frame", {
        timestamp: now,
        timeSinceLastFrame: now - lastFrameTime,
        frameCount,
        width: imageData.width,
        height: imageData.height
      });
      
      processor.processFrame(imageData);
    } else {
      console.log("useSignalProcessor: Frame ignorado (no está procesando)");
    }
  }, [isProcessing, processor, frameCount, lastFrameTime]);

  return {
    isProcessing,
    lastSignal,
    error,
    startProcessing,
    stopProcessing,
    calibrate,
    processFrame,
    frameCount
  };
};
