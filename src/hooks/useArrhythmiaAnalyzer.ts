import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

/**
 * Hook optimizado para análisis de arritmias que utiliza el detector de alta precisión
 */
export const useArrhythmiaAnalyzer = () => {
  // Estado y referencias
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const detectorRef = useRef<ArrhythmiaDetector | null>(null);
  
  // Obtener la instancia del detector (patrón singleton)
  const getDetector = useCallback(() => {
    if (!detectorRef.current) {
      console.log('useArrhythmiaAnalyzer: Creando nueva instancia del ArrhythmiaDetector optimizado');
      detectorRef.current = new ArrhythmiaDetector();
    }
    return detectorRef.current;
  }, []);
  
  /**
   * Reiniciar el analizador de arritmias
   */
  const reset = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.reset();
    }
    setArrhythmiaCounter(0);
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Procesar datos para detección de arritmias utilizando el detector optimizado
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] },
    maxArrhythmias: number = 15
  ) => {
    try {
      const detector = getDetector();
      
      // Actualizar intervalos y amplitudes en el detector
      detector.updateIntervals(
        rrData.intervals,
        rrData.lastPeakTime,
        // Si hay amplitudes disponibles, usar la más reciente
        rrData.amplitudes && rrData.amplitudes.length > 0 
          ? rrData.amplitudes[rrData.amplitudes.length - 1]
          : undefined
      );
      
      // Ejecutar el detector de arritmias optimizado
      const result = detector.detect();
      
      // Actualizar contador local
      if (result.count !== arrhythmiaCounter) {
        setArrhythmiaCounter(Math.min(result.count, maxArrhythmias));
      }
      
      // Preparar datos para UI y análisis
      const currentTime = Date.now();
      const lastArrhythmiaData = result.detected ? {
        timestamp: currentTime,
        rmssd: result.data?.rmssd || 0,
        rrVariation: result.data?.rrVariation || 0,
        prematureBeat: result.data?.prematureBeat || false
      } : null;
      
      return {
        detected: result.detected,
        arrhythmiaStatus: result.status,
        lastArrhythmiaData
      };
    } catch (error) {
      console.error("Error en processArrhythmia:", error);
      return {
        detected: false,
        arrhythmiaStatus: "SIN ARRITMIAS|0",
        lastArrhythmiaData: null
      };
    }
  }, [getDetector, arrhythmiaCounter]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
