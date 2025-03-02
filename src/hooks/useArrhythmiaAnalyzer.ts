import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const detectorRef = useRef<ArrhythmiaDetector | null>(null);
  
  // Parámetros para mejorar la estabilidad y precisión
  const STABILIZATION_PERIOD_MS = 4000; // Periodo inicial de estabilización
  const MIN_CONFIDENCE_THRESHOLD = 0.7; // Umbral mínimo de confianza para considerar arritmias
  
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
      
      // Análisis avanzado de confianza en la detección
      if (result.detected && !isStabilizing) {
        // Verificar tiempo desde última detección para validar consistencia
        const timeSinceLastDetection = currentTime - confidenceCache.current.lastDetectionTime;
        
        // Si es una nueva arritmia (no continuación de la anterior)
        if (timeSinceLastDetection > 1200) { // Más de 1.2 segundos = nuevo evento
          confidenceCache.current.consecutiveDetections = 1;
        } else {
          confidenceCache.current.consecutiveDetections++;
        }
        
        // Registrar tiempo de detección
        confidenceCache.current.lastDetectionTime = currentTime;
        confidenceCache.current.detectionCount++;
        
        // Verificar si la detección cumple criterios de confianza
        const isConfidentDetection = 
          confidenceCache.current.consecutiveDetections >= 2 || // Al menos 2 detecciones seguidas
          (result.data?.rmssd || 0) > 50 || // RMSSD elevado (variabilidad alta)
          (result.data?.rrVariation || 0) > 0.15; // Variación RR significativa
        
        if (isConfidentDetection && arrhythmiaCounter < maxArrhythmias) {
          // Solo incrementar contador si es una detección confiable y estamos dentro del límite
          setArrhythmiaCounter(prev => prev + 1);
        }
      } else if (!result.detected) {
        // Reiniciar contador de detecciones consecutivas
        if (currentTime - confidenceCache.current.lastDetectionTime > 2000) { // 2 segundos de inactividad
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
  }, []);

  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
