// Importar el método cleanMemory de cada uno de los hooks correspondientes
import { useEffect, useCallback } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { useHeartBeatProcessor } from './useHeartBeatProcessor';
import { useVitalSignsProcessor } from './useVitalSignsProcessor';

export const useVitalMeasurement = () => {
  const signalProcessor = useSignalProcessor();
  const heartBeatProcessor = useHeartBeatProcessor();
  const vitalSignsProcessor = useVitalSignsProcessor();

  // Función mejorada para iniciar una medición
  const startMeasurement = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando nueva medición");
    
    // Realizar un reset completo de los procesadores antes de empezar
    try {
      // Primero reiniciar todos los procesadores
      vitalSignsProcessor.reset();
      heartBeatProcessor.reset();
      
      // Luego iniciar el procesamiento
      signalProcessor.startProcessing();
      console.log("useVitalMeasurement: Procesamiento iniciado correctamente");
    } catch (err) {
      console.error("useVitalMeasurement: Error al iniciar la medición", err);
      // En caso de error, intentar limpiar memoria y reiniciar
      performMemoryCleanup();
      
      // Segundo intento de iniciar el procesamiento
      signalProcessor.startProcessing();
    }
  }, [signalProcessor, heartBeatProcessor, vitalSignsProcessor]);
  
  // Función mejorada para detener una medición
  const stopMeasurement = useCallback(() => {
    console.log("useVitalMeasurement: Deteniendo medición");
    signalProcessor.stopProcessing();
    
    // Registrar último estado antes de limpieza
    console.log("useVitalMeasurement: Medición finalizada correctamente");
  }, [signalProcessor]);

  // Función para limpiar memoria de forma agresiva
  const performMemoryCleanup = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando limpieza agresiva de memoria");
    
    // Detener el procesamiento primero
    signalProcessor.stopProcessing();
    
    // Llamar a la limpieza específica de cada procesador
    signalProcessor.cleanMemory();
    heartBeatProcessor.cleanMemory();
    vitalSignsProcessor.cleanMemory();
    
    // Liberar memoria adicional
    if (window.gc) {
      setTimeout(() => {
        try {
          window.gc();
          console.log("Garbage collection global ejecutada");
        } catch (e) {
          console.log("Garbage collection no disponible");
        }
      }, 100);
    }
    
    // Programar una segunda limpieza después de un breve retraso
    setTimeout(() => {
      console.log("useVitalMeasurement: Segunda fase de limpieza de memoria");
      if (window.gc) {
        try {
          window.gc();
        } catch (e) {
          console.log("Segunda GC fallida");
        }
      }
    }, 2000);
  }, [signalProcessor, heartBeatProcessor, vitalSignsProcessor]);

  // Ejecutar limpieza de memoria cuando el componente se desmonte
  useEffect(() => {
    return () => {
      // Importante: Siempre detener el procesamiento antes de desmontar
      signalProcessor.stopProcessing();
      performMemoryCleanup();
    };
  }, [performMemoryCleanup, signalProcessor]);

  return {
    ...signalProcessor,
    ...heartBeatProcessor,
    ...vitalSignsProcessor,
    startMeasurement,
    stopMeasurement,
    performMemoryCleanup
  };
};
