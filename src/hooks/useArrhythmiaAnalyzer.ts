import { useState, useRef, useCallback } from 'react';

/**
 * Hook para analizar arritmias en datos de frecuencia cardíaca
 * ACTUALIZADO: Sin límite de arritmias y sincronización mejorada
 */
export const useArrhythmiaAnalyzer = () => {
  // Parámetros optimizados para la detección de arritmias
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 2; // Umbral ajustado para mejor detección
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // AJUSTADO: Tiempo mínimo entre arritmias distintas
  const PREMATURE_BEAT_RATIO = 0.80; // AJUSTADO: Umbral para detección de latidos prematuros
  const COMPENSATORY_PAUSE_RATIO = 1.10; // Umbral para pausa compensatoria
  const AMPLITUDE_THRESHOLD_RATIO = 0.65; // AJUSTADO: Umbral para diferencias de amplitud
  
  // Estado y referencias
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  
  // Buffers de análisis
  const rrBufferRef = useRef<number[]>([]);
  const amplitudeBufferRef = useRef<number[]>([]);
  
  /**
   * Reset all analyzer state
   */
  const reset = useCallback(() => {
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    rrBufferRef.current = [];
    amplitudeBufferRef.current = [];
  }, []);
  
  /**
   * Process RR intervals to detect arrhythmias
   * ACTUALIZADO: Sin límite de arritmias
   */
  const processArrhythmia = useCallback((rrData: { 
    intervals: number[], 
    lastPeakTime: number | null,
    amplitudes?: number[],
    // NUEVO: Parámetros adicionales
    isDicroticPoint?: boolean
  }) => {
    const currentTime = Date.now();
    
    // Add new RR interval to buffer
    if (rrData.intervals.length > 0) {
      rrBufferRef.current.push(rrData.intervals[0]);
      
      // Keep buffer at appropriate size
      if (rrBufferRef.current.length > ANALYSIS_WINDOW_SIZE) {
        rrBufferRef.current.shift();
      }
      
      // If amplitude data available, store it too
      if (rrData.amplitudes && rrData.amplitudes.length > 0) {
        amplitudeBufferRef.current.push(rrData.amplitudes[0]);
        
        if (amplitudeBufferRef.current.length > ANALYSIS_WINDOW_SIZE) {
          amplitudeBufferRef.current.shift();
        }
      }
    }
    
    // Need at least 3 intervals for analysis
    if (rrBufferRef.current.length < 3) {
      return {
        detected: false,
        arrhythmiaStatus: `SIN ARRITMIAS|${arrhythmiaCounter}`
      };
    }
    
    // Calculate average RR interval (baseline)
    const avgRR = rrBufferRef.current.reduce((sum, val) => sum + val, 0) / 
                 rrBufferRef.current.length;
    
    // Look for premature beats in the last 3 intervals
    const recentRR = rrBufferRef.current.slice(-3);
    
    // Check for characteristic premature beat pattern
    // A premature beat is typically followed by a compensatory pause
    let detectionConfidence = 0;
    let prematureBeatDetected = false;
    
    // MEJORADO: Verificar patrón específico de latido prematuro
    if (recentRR.length >= 3) {
      // Verificar si el intervalo medio es significativamente corto (prematuro)
      if (recentRR[1] < avgRR * PREMATURE_BEAT_RATIO) {
        detectionConfidence++;
        
        // Verificar si el siguiente intervalo es largo (pausa compensatoria)
        if (recentRR[2] > avgRR * COMPENSATORY_PAUSE_RATIO) {
          detectionConfidence += 2; // Dar más peso a este patrón característico
        }
        
        // Verificar amplitud si está disponible
        if (amplitudeBufferRef.current.length >= 3) {
          const recentAmplitudes = amplitudeBufferRef.current.slice(-3);
          const avgAmplitude = amplitudeBufferRef.current.reduce((sum, val) => sum + val, 0) / 
                              amplitudeBufferRef.current.length;
          
          // Verificar si la amplitud del latido prematuro es diferente
          if (Math.abs(recentAmplitudes[1] - avgAmplitude) / avgAmplitude > AMPLITUDE_THRESHOLD_RATIO) {
            detectionConfidence++;
          }
        }
      }
    }
    
    // Verificar patrón alternante (posible arritmia)
    if (recentRR.length >= 5) {
      const alternating = checkForAlternatingPattern(recentRR);
      if (alternating) {
        detectionConfidence++;
      }
    }
    
    // Determine if we have sufficient confidence for this to be a premature beat
    prematureBeatDetected = detectionConfidence >= ARRHYTHMIA_CONFIRMATION_THRESHOLD;
    
    // Only count as a new arrhythmia if it's been a while since the last one
    const sufficientTimeSinceLastArrhythmia = 
      currentTime - lastArrhythmiaTime.current > MIN_TIME_BETWEEN_ARRHYTHMIAS;
    
    let increment = false;
    
    if (prematureBeatDetected && sufficientTimeSinceLastArrhythmia) {
      // ELIMINADO: Verificación de si hemos llegado al límite máximo - SIN LÍMITE
      lastArrhythmiaTime.current = currentTime;
      increment = true;
      hasDetectedArrhythmia.current = true;
    }
    
    // Update arrhythmia counter
    if (increment) {
      setArrhythmiaCounter(prev => prev + 1);
    }
    
    // Prepare result data
    const arrhythmiaStatus = hasDetectedArrhythmia.current ? 
      `ARRITMIA DETECTADA|${arrhythmiaCounter + (increment ? 1 : 0)}` : 
      `SIN ARRITMIAS|${arrhythmiaCounter}`;
    
    return {
      detected: prematureBeatDetected,
      arrhythmiaStatus,
      lastArrhythmiaData: prematureBeatDetected ? {
        timestamp: currentTime,
        rmssd: calculateRMSSD(rrBufferRef.current),
        rrVariation: calculateRRVariability(rrBufferRef.current)
      } : null
    };
  }, [arrhythmiaCounter]);
  
  /**
   * NUEVO: Verifica si hay un patrón alternante en los intervalos RR
   */
  const checkForAlternatingPattern = (intervals: number[]): boolean => {
    if (intervals.length < 4) return false;
    
    // Calcular diferencias consecutivas
    const diffs = [];
    for (let i = 1; i < intervals.length; i++) {
      diffs.push(intervals[i] - intervals[i-1]);
    }
    
    // Verificar si las diferencias alternan entre signo positivo y negativo
    let alternatingCount = 0;
    for (let i = 1; i < diffs.length; i++) {
      if (Math.sign(diffs[i]) !== Math.sign(diffs[i-1])) {
        alternatingCount++;
      }
    }
    
    // Si la mayoría de diferencias alternan, es un patrón alternante
    return alternatingCount >= Math.floor(diffs.length * 0.7);
  };
  
  /**
   * Calculate RR interval variability
   */
  const calculateRRVariability = (intervals: number[]): number => {
    if (intervals.length < 3) return 0;
    
    const recentIntervals = intervals.slice(-3);
    const diffs = [];
    
    for (let i = 1; i < recentIntervals.length; i++) {
      diffs.push(Math.abs(recentIntervals[i] - recentIntervals[i-1]));
    }
    
    return diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
  };
  
  /**
   * Calculate RMSSD (Root Mean Square of Successive Differences)
   */
  const calculateRMSSD = (intervals: number[]): number => {
    if (intervals.length < 4) return 0;
    
    const recentIntervals = intervals.slice(-4);
    let sumSquaredDiff = 0;
    let count = 0;
    
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += diff * diff;
      count++;
    }
    
    return count > 0 ? Math.sqrt(sumSquaredDiff / count) : 0;
  };
  
  return {
    arrhythmiaCounter,
    reset,
    processArrhythmia
  };
};
