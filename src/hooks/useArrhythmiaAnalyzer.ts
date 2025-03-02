import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const detectorRef = useRef<ArrhythmiaDetector | null>(null);
  
  // Parámetros más sensibles para mejorar la detección
  const STABILIZATION_PERIOD_MS = 3000; // Reducido a 3 segundos
  const MIN_CONFIDENCE_THRESHOLD = 0.5; // Reducido para ser más permisivo
  
  // Cache para análisis de confianza en detecciones
  const confidenceCache = useRef<{
    lastDetectionTime: number;
    detectionCount: number;
    falsePositiveCount: number;
    consecutiveDetections: number;
  }>({
    lastDetectionTime: 0,
    detectionCount: 0,
    falsePositiveCount: 0,
    consecutiveDetections: 0
  });

  // Inicialización lazy del detector
  const getDetector = useCallback(() => {
    if (!detectorRef.current) {
      detectorRef.current = new ArrhythmiaDetector();
      console.log("useArrhythmiaAnalyzer: Detector creado");
    }
    return detectorRef.current;
  }, []);

  // Función principal para procesar arritmias con verificación mejorada
  const processArrhythmia = useCallback(
    (rrData: { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] }, 
     maxArrhythmias: number) => {
      const detector = getDetector();
      const currentTime = Date.now();
      const startTime = detector.getStartTime ? detector.getStartTime() : 0;
      const timeElapsed = currentTime - startTime;
      
      // Verificar si estamos en periodo de estabilización inicial
      const isStabilizing = timeElapsed < STABILIZATION_PERIOD_MS;
      
      // Actualizar detector con nuevos datos incluyendo amplitudes
      detector.updateIntervals(
        rrData.intervals,
        rrData.lastPeakTime,
        rrData.amplitudes && rrData.amplitudes.length > 0 
          ? rrData.amplitudes[rrData.amplitudes.length - 1] 
          : undefined
      );
      
      // Obtener resultado inicial de detección
      const result = detector.detect();
      
      // Análisis simplificado para mayor sensibilidad
      if (result.detected) {
        // Verificar tiempo desde última detección
        const timeSinceLastDetection = currentTime - confidenceCache.current.lastDetectionTime;
        
        // Si es una nueva arritmia (no continuación de la anterior)
        if (timeSinceLastDetection > 1000) { // Reducido a 1 segundo
          confidenceCache.current.consecutiveDetections = 1;
          
          // Solo incrementar si estamos por debajo del máximo
          if (arrhythmiaCounter < maxArrhythmias) {
            setArrhythmiaCounter(prev => prev + 1);
            console.log("useArrhythmiaAnalyzer: Nueva arritmia contabilizada, total:", arrhythmiaCounter + 1);
          }
        } else {
          confidenceCache.current.consecutiveDetections++;
        }
        
        // Registrar tiempo de detección
        confidenceCache.current.lastDetectionTime = currentTime;
        confidenceCache.current.detectionCount++;
      } else if (!result.detected) {
        // Reiniciar contador de detecciones consecutivas si ha pasado suficiente tiempo
        if (currentTime - confidenceCache.current.lastDetectionTime > 1500) { // Reducido a 1.5 segundos
          confidenceCache.current.consecutiveDetections = 0;
        }
      }
            
      // Prepara datos para mostrar en la interfaz
      return {
        detected: result.detected,
        arrhythmiaStatus: result.detected 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}` 
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: result.detected ? {
          timestamp: currentTime,
          rmssd: result.data?.rmssd || 0,
          rrVariation: result.data?.rrVariation || 0
        } : null
      };
    },
    [arrhythmiaCounter, getDetector]
  );

  // Reiniciar detector y contadores
  const reset = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.reset();
    }
    setArrhythmiaCounter(0);
    confidenceCache.current = {
      lastDetectionTime: 0,
      detectionCount: 0,
      falsePositiveCount: 0,
      consecutiveDetections: 0
    };
    console.log("useArrhythmiaAnalyzer: Reset completo");
  }, []);

  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
