// Importar el método cleanMemory de cada uno de los hooks correspondientes
import { useEffect, useCallback, useState, useRef } from 'react';
import { useSignalProcessor } from './useSignalProcessor';
import { useHeartBeatProcessor } from './useHeartBeatProcessor';
import { useVitalSignsProcessor } from './useVitalSignsProcessor';

export const useVitalMeasurement = () => {
  // Referencias a los procesadores
  const signalProcessor = useSignalProcessor();
  const heartBeatProcessor = useHeartBeatProcessor();
  const vitalSignsProcessor = useVitalSignsProcessor();
  
  // NUEVO: Estado para seguimiento de calidad de señal
  const [signalQuality, setSignalQuality] = useState(0);
  const [fingerDetected, setFingerDetected] = useState(false);
  
  // NUEVO: Referencias para seguimiento de performance
  const lastPerformanceTime = useRef<number>(Date.now());
  const processingTimesRef = useRef<number[]>([]);
  const memoryUsageRef = useRef<number[]>([]);
  
  // NUEVO: Función para iniciar la medición
  const startMeasurement = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando medición");
    
    // Iniciar cada procesador en secuencia
    signalProcessor.startProcessing();
    
    // Resetear los valores de seguimiento
    setSignalQuality(0);
    setFingerDetected(false);
    lastPerformanceTime.current = Date.now();
    processingTimesRef.current = [];
    memoryUsageRef.current = [];
    
  }, [signalProcessor]);
  
  // NUEVO: Función para detener la medición
  const stopMeasurement = useCallback(() => {
    console.log("useVitalMeasurement: Deteniendo medición");
    
    // Detener procesadores
    signalProcessor.stopProcessing();
    
    // Calcular estadísticas de rendimiento
    if (processingTimesRef.current.length > 0) {
      const avgProcessingTime = processingTimesRef.current.reduce((sum, time) => sum + time, 0) / 
                             processingTimesRef.current.length;
      console.log(`useVitalMeasurement: Tiempo promedio de procesamiento: ${avgProcessingTime.toFixed(2)}ms`);
    }
  }, [signalProcessor]);
  
  // NUEVO: Función para procesar un frame con medición de performance
  const processFrame = useCallback((imageData: ImageData) => {
    const startTime = performance.now();
    
    // Procesar el frame con el procesador de señal
    signalProcessor.processFrame(imageData);
    
    // Medir tiempo de procesamiento
    const processingTime = performance.now() - startTime;
    processingTimesRef.current.push(processingTime);
    
    // Limitar el historial de tiempos
    if (processingTimesRef.current.length > 100) {
      processingTimesRef.current.shift();
    }
    
    // Actualizar calidad cada 1 segundo
    const now = Date.now();
    if (now - lastPerformanceTime.current > 1000) {
      lastPerformanceTime.current = now;
      
      // Medir uso de memoria si está disponible
      if (window.performance && window.performance.memory) {
        const memoryInfo = window.performance.memory;
        memoryUsageRef.current.push(memoryInfo.usedJSHeapSize / (1024 * 1024)); // MB
        
        if (memoryUsageRef.current.length > 60) { // Mantener 1 minuto de historia
          memoryUsageRef.current.shift();
        }
      }
    }
  }, [signalProcessor]);

  // NUEVO: Escuchar cambios en la señal del procesador
  useEffect(() => {
    if (signalProcessor.lastSignal) {
      setSignalQuality(signalProcessor.lastSignal.quality);
      setFingerDetected(signalProcessor.lastSignal.fingerDetected);
    }
  }, [signalProcessor.lastSignal]);

  // Función para limpiar memoria de forma agresiva
  const performMemoryCleanup = useCallback(() => {
    console.log("useVitalMeasurement: Iniciando limpieza agresiva de memoria");
    
    // Ejecutar cada limpieza en secuencia para maximizar la liberación de memoria
    // Llamar a la limpieza específica de cada procesador
    signalProcessor.cleanMemory();
    setTimeout(() => {
      heartBeatProcessor.cleanMemory();
      setTimeout(() => {
        vitalSignsProcessor.cleanMemory();
        
        // Liberar memoria adicional mediante GC global
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
      }, 100);
    }, 100);
    
    // Programar una segunda limpieza después de un breve retraso
    setTimeout(() => {
      console.log("useVitalMeasurement: Segunda fase de limpieza de memoria");
      
      // Forzar liberación de referencias
      processingTimesRef.current = [];
      memoryUsageRef.current = [];
      
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
    signalQuality,
    fingerDetected,
    startMeasurement,
    stopMeasurement,
    processFrame,
    performMemoryCleanup
  };
};
