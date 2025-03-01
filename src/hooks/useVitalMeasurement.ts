
// Importar el método cleanMemory de cada uno de los hooks correspondientes
import { useEffect, useCallback } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { useHeartBeatProcessor } from './useHeartBeatProcessor';
import { useVitalSignsProcessor } from './useVitalSignsProcessor';

export const useVitalMeasurement = () => {
  const signalProcessor = useSignalProcessor();
  const heartBeatProcessor = useHeartBeatProcessor();
  const vitalSignsProcessor = useVitalSignsProcessor();

  // Función para limpiar memoria de forma agresiva
  const performMemoryCleanup = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando limpieza agresiva de memoria");
    
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
      performMemoryCleanup();
    };
  }, [performMemoryCleanup]);

  return {
    ...signalProcessor,
    ...heartBeatProcessor,
    ...vitalSignsProcessor,
    performMemoryCleanup
  };
};
