import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDetector } from '../modules/ArrhythmiaDetector';

/**
 * Hook para analizar arritmias en datos de ritmo cardíaco
 * VERSIÓN CORREGIDA Y SIMPLIFICADA
 */
export const useArrhythmiaAnalyzer = () => {
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const detectorRef = useRef<ArrhythmiaDetector | null>(null);
  
  // CRUCIALES: Referencias para solucionar problemas de estado
  const lastDetectionTimeRef = useRef(0);
  const processingDataRef = useRef(false);
  
  // Inicialización lazy del detector - GARANTIZAR UNA SOLA INSTANCIA
  const getDetector = useCallback(() => {
    if (!detectorRef.current) {
      console.log("useArrhythmiaAnalyzer: CREANDO NUEVO DETECTOR");
      detectorRef.current = new ArrhythmiaDetector();
      // Hacer accesible para debugging
      (window as any).arrhythmiaDetector = detectorRef.current;
    }
    return detectorRef.current;
  }, []);

  // Función SIMPLIFICADA para procesar arritmias - ALGORITMO DIRECTO
  const processArrhythmia = useCallback(
    (rrData: { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] }, 
     maxArrhythmias: number) => {
      // Protección contra llamadas concurrentes
      if (processingDataRef.current) {
        console.warn("useArrhythmiaAnalyzer: Omitiendo procesamiento concurrente");
        return {
          detected: false,
          arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`,
          lastArrhythmiaData: null
        };
      }
      
      processingDataRef.current = true;
      
      try {
        const detector = getDetector();
        const currentTime = Date.now();
        
        // 1. CRÍTICO: Verificar que tenemos datos válidos para procesar
        if (!rrData.intervals || rrData.intervals.length < 2) {
          console.log("useArrhythmiaAnalyzer: Datos insuficientes");
          return {
            detected: false,
            arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`,
            lastArrhythmiaData: null
          };
        }
        
        // 2. CRÍTICO: Asegurar que tenemos amplitudes o proveer valores por defecto
        const validAmplitudes = rrData.amplitudes && rrData.amplitudes.length > 0;
        if (!validAmplitudes) {
          console.warn("useArrhythmiaAnalyzer: Sin amplitudes, usando valores por defecto");
          // Crear amplitudes artificiales
          rrData.amplitudes = rrData.intervals.map((_, i) => 1.0);
        }
        
        // 3. Actualizar el detector con los nuevos datos
        detector.updateIntervals(
          rrData.intervals,
          rrData.lastPeakTime,
          rrData.amplitudes && rrData.amplitudes.length > 0 
            ? rrData.amplitudes[rrData.amplitudes.length - 1] 
            : 1.0
        );
        
        // 4. Obtener resultado de detección
        const result = detector.detect();
        
        // 5. SIMPLIFICADO: Respuesta directa del detector sin lógica adicional
        if (result.detected) {
          // Solo incrementar el contador si es una nueva arritmia (no continuación)
          const timeSinceLastDetection = currentTime - lastDetectionTimeRef.current;
          
          if (timeSinceLastDetection > 1000 && arrhythmiaCounter < maxArrhythmias) {
            setArrhythmiaCounter(prev => prev + 1);
            lastDetectionTimeRef.current = currentTime;
            console.log("useArrhythmiaAnalyzer: NUEVA ARRITMIA #", arrhythmiaCounter + 1);
          }
        }
        
        // 6. Generar respuesta para la UI
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
      } finally {
        processingDataRef.current = false;
      }
    },
    [arrhythmiaCounter, getDetector]
  );

  // Reset completo y claro
  const reset = useCallback(() => {
    console.log("useArrhythmiaAnalyzer: RESET COMPLETO");
    
    if (detectorRef.current) {
      detectorRef.current.reset();
    }
    
    setArrhythmiaCounter(0);
    lastDetectionTimeRef.current = 0;
    processingDataRef.current = false;
  }, []);

  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
