/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { PPGSignalProcessor } from '../modules/SignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const processorRef = useRef<PPGSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  
  useEffect(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador");
    processorRef.current = new PPGSignalProcessor();
    
    processorRef.current.onSignalReady = (signal: ProcessedSignal) => {
      console.log("useSignalProcessor: Señal recibida:", {
        timestamp: signal.timestamp,
        quality: signal.quality,
        filteredValue: signal.filteredValue
      });
      
      // Extract red and ir values from RGB components if available
      // This is important for hemoglobin calculation
      if (signal.rawPixelData) {
        // Use the data for hemoglobin calculation in the VitalSignsProcessor
        const vitalSignsProcessor = window.vitalSignsProcessor;
        if (vitalSignsProcessor) {
          const redValue = signal.rawPixelData.r || 0;
          const irValue = signal.rawPixelData.ir || signal.rawPixelData.g || 0;
          console.log(`Signal processor: Updating buffers - Red: ${redValue}, IR: ${irValue}`);
          vitalSignsProcessor.updateSignalBuffers(redValue, irValue);
        }
      }
      
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

  const cleanMemory = useCallback(() => {
    console.log("useSignalProcessor: Limpieza agresiva de memoria");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setLastSignal(null);
    setError(null);
    
    if (window.gc) {
      try {
        window.gc();
        console.log("useSignalProcessor: Garbage collection solicitada");
      } catch (e) {
        console.log("useSignalProcessor: Garbage collection no disponible");
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
