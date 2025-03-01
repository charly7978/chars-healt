
import { useState, useRef, useCallback } from 'react';

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  // Constants for arrhythmia detection
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // Mínimo 1 segundo entre arritmias
  
  // State and refs
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  
  // Analysis buffers
  const rrIntervalsHistoryRef = useRef<number[][]>([]);
  const rmssdHistoryRef = useRef<number[]>([]);
  const rrVariationHistoryRef = useRef<number[]>([]);
  
  /**
   * Reset all analysis state
   */
  const reset = useCallback(() => {
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    
    // Clear buffers
    rrIntervalsHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Analyze RR intervals to detect arrhythmias based on medical algorithms
   */
  const analyzeArrhythmia = useCallback((intervals: number[]) => {
    if (intervals.length < 4) return { detected: false, confidence: 0, rmssd: 0, rrVariation: 0 };
    
    // Seleccionar últimos 4 intervalos para análisis (suficientes para detectar la mayoría de arritmias)
    const recentIntervals = intervals.slice(-4);
    
    // 1. Calcular RMSSD (Root Mean Square of Successive Differences)
    // Un indicador clave de la variabilidad de la frecuencia cardíaca
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += Math.pow(diff, 2);
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
    
    // 2. Calcular variación porcentual de intervalos RR
    const avgRR = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    // Tomar el último intervalo R-R para compararlo con el promedio
    const lastRR = recentIntervals[recentIntervals.length - 1];
    const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
    
    // 3. Calcular Índice de Arritmia basado en el coeficiente de variación
    const rrStandardDeviation = Math.sqrt(
      recentIntervals.reduce((sum, rr) => sum + Math.pow(rr - avgRR, 2), 0) / recentIntervals.length
    );
    const coefficientOfVariation = rrStandardDeviation / avgRR;
    
    // 4. Calcular Poincaré SD1 (variabilidad a corto plazo)
    let sd1Sum = 0;
    for (let i = 0; i < recentIntervals.length - 1; i++) {
      const x1 = recentIntervals[i];
      const x2 = recentIntervals[i + 1];
      sd1Sum += Math.pow((x2 - x1) / Math.sqrt(2), 2);
    }
    const sd1 = Math.sqrt(sd1Sum / (recentIntervals.length - 1));
    
    // 5. Buscar presencia de latidos ectópicos (significativamente diferentes)
    const ectopicBeatDetected = recentIntervals.some(interval => 
      Math.abs(interval - avgRR) > (avgRR * 0.40) // 40% de diferencia es indicativo de latido ectópico
    );
    
    // 6. Algoritmo avanzado para detección de arritmias combinando múltiples indicadores
    // Criterios basados en literatura médica para arritmias cardíacas
    let arrhythmiaConfidence = 
      (rmssd > 50 ? 0.35 : 0) +                    // Alta RMSSD
      (rrVariation > 0.2 ? 0.25 : 0) +             // Alta variación RR
      (coefficientOfVariation > 0.15 ? 0.20 : 0) + // Alto coeficiente de variación
      (sd1 > 30 ? 0.10 : 0) +                      // Alta variabilidad a corto plazo
      (ectopicBeatDetected ? 0.10 : 0);            // Presencia de latidos ectópicos
    
    // Guardar datos para análisis de tendencias
    rrIntervalsHistoryRef.current.push(recentIntervals);
    if (rrIntervalsHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrIntervalsHistoryRef.current.shift();
    }
    
    rmssdHistoryRef.current.push(rmssd);
    if (rmssdHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rmssdHistoryRef.current.shift();
    }
    
    rrVariationHistoryRef.current.push(rrVariation);
    if (rrVariationHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrVariationHistoryRef.current.shift();
    }
    
    // Análisis de tendencias para confirmar arritmias y reducir falsos positivos
    let confirmedArrhythmia = arrhythmiaConfidence >= 0.70; // Alta confianza en detección inmediata
    
    // Si no está confirmado por alta confianza, verificar persistencia en ventana de análisis
    if (!confirmedArrhythmia && rmssdHistoryRef.current.length >= 3) {
      // Contar cuántos de los últimos análisis mostraron alta RMSSD y variación RR
      let confirmationCount = 0;
      for (let i = 1; i <= Math.min(ARRHYTHMIA_CONFIRMATION_THRESHOLD, rmssdHistoryRef.current.length); i++) {
        const historicIndex = rmssdHistoryRef.current.length - i;
        if (historicIndex >= 0 && 
            rmssdHistoryRef.current[historicIndex] > 40 && 
            rrVariationHistoryRef.current[historicIndex] > 0.18) {
          confirmationCount++;
        }
      }
      
      // Confirmar arritmia si hay suficientes ciclos que la respaldan
      if (confirmationCount >= ARRHYTHMIA_CONFIRMATION_THRESHOLD - 1) {
        confirmedArrhythmia = true;
        // Ajustar confianza basada en persistencia
        arrhythmiaConfidence = Math.max(arrhythmiaConfidence, 0.65);
      }
    }
    
    return {
      detected: confirmedArrhythmia,
      confidence: arrhythmiaConfidence,
      rmssd,
      rrVariation
    };
  }, []);
  
  /**
   * Process new RR interval data and update arrhythmia state
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[], lastPeakTime: number | null },
    maxArrhythmias: number = 15
  ) => {
    if (!rrData?.intervals || rrData.intervals.length < 4) {
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    const currentTime = Date.now();
    const arrhythmiaAnalysis = analyzeArrhythmia(rrData.intervals);
    
    if (arrhythmiaAnalysis.detected && 
        arrhythmiaAnalysis.confidence >= 0.65 && 
        currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
        arrhythmiaCounter < maxArrhythmias) {
      
      hasDetectedArrhythmia.current = true;
      setArrhythmiaCounter(prev => prev + 1);
      lastArrhythmiaTime.current = currentTime;
      
      console.log("Arritmia detectada:", {
        rmssd: arrhythmiaAnalysis.rmssd,
        rrVariation: arrhythmiaAnalysis.rrVariation,
        confidence: arrhythmiaAnalysis.confidence,
        intervals: rrData.intervals.slice(-4),
        counter: arrhythmiaCounter + 1
      });

      return {
        detected: true,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
        lastArrhythmiaData: {
          timestamp: currentTime,
          rmssd: arrhythmiaAnalysis.rmssd,
          rrVariation: arrhythmiaAnalysis.rrVariation
        }
      };
    }
    
    // Si ya detectamos una arritmia antes, mantenemos el estado
    if (hasDetectedArrhythmia.current) {
      return {
        detected: false,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    return {
      detected: false,
      arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`,
      lastArrhythmiaData: null
    };
  }, [arrhythmiaCounter, analyzeArrhythmia]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
