
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AdvancedSignalProcessor } from '../modules/AdvancedSignalProcessor';
import { ProcessedSignal, ProcessingError } from '../types/signal';

export const useSignalProcessor = () => {
  const processorRef = useRef<AdvancedSignalProcessor | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignal, setLastSignal] = useState<ProcessedSignal | null>(null);
  const [error, setError] = useState<ProcessingError | null>(null);
  
  useEffect(() => {
    console.log("useSignalProcessor: Creando nueva instancia del procesador avanzado");
    processorRef.current = new AdvancedSignalProcessor(
      // Signal ready callback
      (signal: ProcessedSignal) => {
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
      },
      // Error callback
      (error: ProcessingError) => {
        console.error("useSignalProcessor: Error recibido:", error);
        setError(error);
      }
    );

    console.log("useSignalProcessor: Procesador avanzado creado");
    
    return () => {
      console.log("useSignalProcessor: Limpiando y destruyendo procesador avanzado");
      if (processorRef.current) {
        processorRef.current.stop();
        processorRef.current = null;
      }
    };
  }, []);

  const startProcessing = useCallback(() => {
    console.log("useSignalProcessor: Iniciando procesamiento avanzado");
    if (processorRef.current) {
      setIsProcessing(true);
      processorRef.current.start();
    }
  }, []);

  const stopProcessing = useCallback(() => {
    console.log("useSignalProcessor: Deteniendo procesamiento avanzado");
    if (processorRef.current) {
      processorRef.current.stop();
    }
    setIsProcessing(false);
    setLastSignal(null);
    setError(null);
  }, []);

  const calibrate = useCallback(async () => {
    try {
      console.log("useSignalProcessor: Solicitud de calibración");
      return true;
    } catch (error) {
      console.error("useSignalProcessor: Error en calibración:", error);
      return false;
    }
  }, []);

  const processFrame = useCallback((imageData: ImageData) => {
    if (isProcessing && processorRef.current) {
      processorRef.current.processFrame(imageData);
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
