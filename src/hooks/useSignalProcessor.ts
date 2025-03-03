import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  
  // Usar inicialización lazy para el procesador
  useEffect(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador");
    processorRef.current = new PPGSignalProcessor();
    
    processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
      console.log("useSignalProcessor: Señal recibida:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue
      });
      setLastSignal(signal);
      setError(null);
    };

    processorRef.current.onError = (error: ProcessingError) => {
      console.error("useSignalProcessor: Error recibido:", error);
      setError(error);
    };

    console.log("useSignalProcessor: Iniciando procesador");
    processorRef.current.initialize().catch(error => {
      console.error("useSignalProcessor: Error de inicialización:", error);
    });

    return () => {
      console.log("useSignalProcessor: Limpiando y destruyendo procesador");
      if (processorRef.current) {
        processorRef.current.stop();
        // Liberar referencias explícitamente
        processorRef.current.onSignalReady = null;
        processorRef.current.onError = null;
        processorRef.current = null;
      }
    };
  }, []);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento");
    if (processorRef.current) {
      setIsProcessing(true);
      processorRef.current.start();
    }
  }, []);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    // Liberar memoria explícitamente
    setLastSignal(null);
    setError(null);
  }, []);

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Iniciando calibración");
      if (processorRef.current) {
        await processorRef.current.calibrate();
        console.log("useSignalProcessor: Calibración exitosa");
        return true;
      }
      return false;
    } catch (error) {
      console.error("useSignalProcessor: Error de calibración:", error);
      return false;
    }
  }, []);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing && processorRef.current) {
      console.log("useSignalProcessor: Procesando nuevo frame");
      processorRef.current.processFrame(imageData);
    } else {
      console.log("useSignalProcessor: Frame ignorado (no está procesando)");
    }
  }, [isProcessing]);

  // Función para liberar memoria de forma más agresiva
  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    
    // Forzar limpieza del garbage collector si está disponible
    if (window.gc) {
      try {
        window.gc();
        console.log("useSignalProcessor: Garbage collection solicitada");
      } catch (e) {
        console.log("useSignalProcessor: Garbage collection no disponible");
      }
    }
  }, []);

  // Mejora relevante para la optimización del renderizado
  useEffect(() => {
    if (!rawSignal || rawSignal.length === 0) {
      setProcessedSignal(null);
      setSignalQuality('poor');
      return;
    }
    
    // Crear una copia para evitar modificaciones inesperadas
    const signalToProcess = [...rawSignal];
    
    // Técnica de procesamiento optimizada para flujo en tiempo real
    // 1. Eliminación de valores extremos (outliers)
    const filteredOutliers = removeOutliers(signalToProcess);
    
    // 2. Filtro de paso banda médico (0.5Hz-8Hz para componentes cardíacos)
    const filteredSignal = applyBandpassFilter(filteredOutliers);
    
    // 3. Normalización para estabilizar la visualización
    const normalizedSignal = normalizeSignal(filteredSignal);
    
    // 4. Evaluación de calidad de la señal
    const quality = evaluateSignalQuality(normalizedSignal);
    
    // Actualizar estado con procesamiento optimizado
    setProcessedSignal(normalizedSignal);
    setSignalQuality(quality);
    
    // Análisis de frames para optimizar rendimiento
    if (performance && performance.now) {
      const currentTime = performance.now();
      if (lastFrameTimeRef.current) {
        const frameTime = currentTime - lastFrameTimeRef.current;
        if (frameTime > 50) {
          // Rest of the function remains unchanged
        }
      }
    }
  }, []);

  return {
    isProcessing,
    lastSignal,
    error,
    startProcessing,
    stopProcessing,
    calibrate,
    processFrame,
    cleanMemory
  };
};
