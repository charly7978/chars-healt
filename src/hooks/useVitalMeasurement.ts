// Importar el método cleanMemory de cada uno de los hooks correspondientes
import { useEffect, useCallback } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { useHeartBeatProcessor } from './useHeartBeatProcessor';
import { useVitalSignsProcessor } from './useVitalSignsProcessor';

export const useVitalMeasurement = () => {
  const signalProcessor = useSignalProcessor();
  const heartBeatProcessor = useHeartBeatProcessor();
  const vitalSignsProcessor = useVitalSignsProcessor();

  // Función para limpiar memoria de forma agresiva - declarada primero
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

  // Función mejorada para iniciar una medición
  const startMeasurement = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando nueva medición");
    
    // IMPORTANTE: Realizar un reset completo de los procesadores antes de empezar
    // para evitar estados inconsistentes entre sesiones
    try {
      console.log("useVitalMeasurement: Reiniciando procesadores");
      
      // Primero reiniciar todos los procesadores en orden específico
      // para asegurar coherencia
      vitalSignsProcessor.reset();
      heartBeatProcessor.reset();
      
      // Breve pausa para asegurar que los reinicios se completen
      setTimeout(() => {
        // Luego iniciar el procesamiento
        console.log("useVitalMeasurement: Iniciando procesamiento después de reset");
        signalProcessor.startProcessing();
        console.log("useVitalMeasurement: Procesamiento iniciado correctamente");
      }, 50); // Pequeña pausa de 50ms para estabilización
    } catch (err) {
      console.error("useVitalMeasurement: Error al iniciar la medición", err);
      // En caso de error, intentar limpiar memoria y reiniciar
      performMemoryCleanup();
      
      // Segundo intento de iniciar el procesamiento
      setTimeout(() => {
        signalProcessor.startProcessing();
        console.log("useVitalMeasurement: Segundo intento de inicio");
      }, 100);
    }
  }, [signalProcessor, heartBeatProcessor, vitalSignsProcessor, performMemoryCleanup]);
  
  // Función mejorada para detener una medición
  const stopMeasurement = useCallback(() => {
    console.log("useVitalMeasurement: Deteniendo medición");
    
    // Detener el procesamiento explícitamente
    signalProcessor.stopProcessing();
    
    // Leve limpieza sin reset completo para preservar los resultados
    console.log("useVitalMeasurement: Medición finalizada correctamente");
    
    // Programar limpieza después de mostrar resultados
    setTimeout(() => {
      console.log("useVitalMeasurement: Limpieza diferida después de medición");
      vitalSignsProcessor.reset();
      heartBeatProcessor.reset();
    }, 3000); // Esperar 3 segundos después de mostrar los resultados
  }, [signalProcessor, vitalSignsProcessor, heartBeatProcessor]);

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
