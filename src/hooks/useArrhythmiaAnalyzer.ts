
import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

/**
 * Hook para analizar arritmias en datos de frecuencia cardíaca,
 * utilizando exclusivamente el ArrhythmiaDetector
 */
export const useArrhythmiaAnalyzer = () => {
  // Estado y referencias
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const detectorRef = useRef<ArrhythmiaDetector>(new ArrhythmiaDetector());
  
  /**
   * Resetear todos los estados de análisis
   */
  const reset = useCallback(() => {
    setArrhythmiaCounter(0);
    detectorRef.current.reset();
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Procesar nuevos datos de intervalo RR y actualizar el estado de arritmias
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] },
    maxArrhythmias: number = 15
  ) => {
    // Verificar si tenemos datos válidos
    if (!rrData?.intervals || rrData.intervals.length === 0) {
      console.warn("useArrhythmiaAnalyzer - No interval data provided");
      
      return {
        detected: false,
        arrhythmiaStatus: detectorRef.current.getStatus(),
        lastArrhythmiaData: null
      };
    }
    
    // Actualizar datos en el detector
    detectorRef.current.updateIntervals(
      rrData.intervals, 
      rrData.lastPeakTime,
      rrData.amplitudes && rrData.amplitudes.length > 0 ? 
        rrData.amplitudes[rrData.amplitudes.length - 1] : undefined
    );
    
    // Detectar arritmias
    const result = detectorRef.current.detect();
    
    // Si se detectó una nueva arritmia, actualizar el contador
    if (result.detected && arrhythmiaCounter < maxArrhythmias) {
      setArrhythmiaCounter(result.count);
      
      return {
        detected: true,
        arrhythmiaStatus: result.status,
        lastArrhythmiaData: {
          timestamp: Date.now(),
          rmssd: result.data?.rmssd || 0,
          rrVariation: result.data?.rrVariation || 0,
          isPrematureBeat: result.data?.prematureBeat || false
        }
      };
    }
    
    return {
      detected: false,
      arrhythmiaStatus: result.status,
      lastArrhythmiaData: null
    };
  }, [arrhythmiaCounter]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter: arrhythmiaCounter
  };
};
