
import { useState, useEffect, useCallback, useRef } from 'react';
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
  const processingQueueRef = useRef<ImageData[]>([]);
  const processingTimeoutRef = useRef<number | null>(null);
  const batteryLevelRef = useRef<number>(100);
  const lastProcessedValueRef = useRef<number | null>(null);

  useEffect(() => {
    const checkBattery = async () => {
      try {
        if ('getBattery' in navigator) {
          const battery: any = await (navigator as any).getBattery();
          batteryLevelRef.current = battery.level * 100;
          battery.addEventListener('levelchange', () => {
            batteryLevelRef.current = battery.level * 100;
          });
        }
      } catch (error) {
        console.log('Error al obtener nivel de batería:', error);
      }
    };
    
    checkBattery();
  }, []);

  useEffect(() => {
    console.log("useSignalProcessor: Configurando callbacks");
    
    processor.onSignalReady = (signal: ProcessedSignal) => {
      console.log("useSignalProcessor: Señal recibida:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue
      });
      setLastSignal(signal);
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
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      processingQueueRef.current = [];
      processor.stop();
    };
  }, [processor]);

  const processQueue = useCallback(() => {
    if (!isProcessing || processingQueueRef.current.length === 0) return;

    const frame = processingQueueRef.current.shift();
    if (frame) {
      processor.processFrame(frame);
    }

    // Ajustar el intervalo de procesamiento según el nivel de batería
    const processInterval = batteryLevelRef.current < 20 ? 100 : 50;
    processingTimeoutRef.current = window.setTimeout(processQueue, processInterval);
  }, [isProcessing, processor]);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    setIsProcessing(true);
    processor.start();
    processQueue();
  }, [processor, processQueue]);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento");
    setIsProcessing(false);
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingQueueRef.current = [];
    processor.stop();
  }, [processor]);

  const processFrame = useCallback((imageData: ImageData) => {
    if (!isProcessing) {
      console.log("useSignalProcessor: Frame ignorado (no está procesando)");
      return;
    }

    // Optimización de memoria: limitar el tamaño de la cola
    if (processingQueueRef.current.length < (batteryLevelRef.current < 20 ? 3 : 5)) {
      processingQueueRef.current.push(imageData);
    }

    if (!processingTimeoutRef.current) {
      processQueue();
    }
  }, [isProcessing, processQueue]);

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
