import { useState, useRef, useCallback } from 'react';
import { ArrhythmiaDiagnostics } from '../utils/diagnosticLogger';

interface ArrhythmiaAnalyzerResult {
  detected: boolean;
  arrhythmiaStatus: string;
  lastArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  };
}

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  // Constants for arrhythmia detection - adjusted for better accuracy
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 2; // Confirmación con 2 eventos
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 500; // Minimum time between arrhythmias (increased to prevent false positives)
  const PREMATURE_BEAT_RATIO = 0.76; // More strict threshold for premature beat detection
  const COMPENSATORY_PAUSE_RATIO = 1.12; // More strict threshold for compensatory pause
  const AMPLITUDE_THRESHOLD_RATIO = 0.70; // More strict threshold for amplitude differences
  
  // State and refs
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastDetectionTimeRef = useRef(0);
  const rrHistoryRef = useRef<number[]>([]);
  const baselineRef = useRef<number | null>(null);
  
  // Optimizaciones para mejor detección de latidos prematuros
  const amplitudesHistoryRef = useRef<number[]>([]);
  const detectionLockTimeRef = useRef(0);
  
  // DEBUG flag to track detection issues
  const DEBUG_MODE = true;
  
  /**
   * Reset all analysis state
   */
  const reset = useCallback(() => {
    setArrhythmiaCounter(0);
    lastDetectionTimeRef.current = 0;
    rrHistoryRef.current = [];
    baselineRef.current = null;
    amplitudesHistoryRef.current = [];
    detectionLockTimeRef.current = 0;
    
    ArrhythmiaDiagnostics.logReset({
      source: 'ArrhythmiaAnalyzer',
      timestamp: Date.now()
    });
    
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Process new RR interval data and update arrhythmia state
   */
  const processArrhythmia = useCallback((
    rrData: { 
      intervals: number[]; 
      lastPeakTime: number | null;
      amplitude?: number;  // Incluir amplitud como parámetro opcional
    }, 
    maxCount: number = 10
  ): ArrhythmiaAnalyzerResult => {
    const currentTime = Date.now();
    
    // No detectar más arritmias si ya alcanzamos el límite
    if (arrhythmiaCounter >= maxCount) {
      return {
        detected: false,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter}`
      };
    }
    
    // No procesar si no hay intervalos o no hay tiempo de pico
    if (!rrData.intervals || rrData.intervals.length === 0 || !rrData.lastPeakTime) {
      return {
        detected: false,
        arrhythmiaStatus: arrhythmiaCounter > 0 ? 
          `ARRITMIA DETECTADA|${arrhythmiaCounter}` : 
          `SIN ARRITMIAS|${arrhythmiaCounter}`
      };
    }
    
    // Registrar datos para diagnóstico
    if (rrData.amplitude !== undefined) {
      ArrhythmiaDiagnostics.logSignalProcessing({
        source: 'ArrhythmiaAnalyzer',
        amplitudeReceived: true,
        amplitude: rrData.amplitude,
        intervalCount: rrData.intervals.length
      });
    }
    
    // Si estamos en periodo de bloqueo después de una detección, no buscar nuevas
    if (currentTime - detectionLockTimeRef.current < 1500) {
      return {
        detected: false,
        arrhythmiaStatus: arrhythmiaCounter > 0 ? 
          `ARRITMIA DETECTADA|${arrhythmiaCounter}` : 
          `SIN ARRITMIAS|${arrhythmiaCounter}`
      };
    }
    
    // Actualizar historial
    const newInterval = rrData.intervals[rrData.intervals.length - 1];
    rrHistoryRef.current.push(newInterval);
    
    // Limitar tamaño del historial
    if (rrHistoryRef.current.length > 10) {
      rrHistoryRef.current = rrHistoryRef.current.slice(-10);
    }
    
    // Registrar amplitud si está disponible
    if (rrData.amplitude !== undefined) {
      amplitudesHistoryRef.current.push(rrData.amplitude);
      
      // Limitar tamaño del historial de amplitudes
      if (amplitudesHistoryRef.current.length > 10) {
        amplitudesHistoryRef.current = amplitudesHistoryRef.current.slice(-10);
      }
    }
    
    // Establecer línea base
    if (baselineRef.current === null && rrHistoryRef.current.length >= 3) {
      const sorted = [...rrHistoryRef.current].sort((a, b) => a - b);
      baselineRef.current = sorted[Math.floor(sorted.length / 2)]; // Mediana
    }
    
    // No intentar detectar arritmias hasta tener suficiente historial
    if (rrHistoryRef.current.length < 4 || baselineRef.current === null) {
      return {
        detected: false,
        arrhythmiaStatus: arrhythmiaCounter > 0 ? 
          `ARRITMIA DETECTADA|${arrhythmiaCounter}` : 
          `SIN ARRITMIAS|${arrhythmiaCounter}`
      };
    }
    
    // Calcular RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < rrHistoryRef.current.length; i++) {
      const diff = rrHistoryRef.current[i] - rrHistoryRef.current[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (rrHistoryRef.current.length - 1));
    
    // Calcular variación RR relativa a la línea base
    const rrVariation = Math.abs(newInterval - baselineRef.current) / baselineRef.current;
    
    // ALGORITMO MEJORADO PARA DETECCIÓN DE LATIDOS PREMATUROS
    let arrhythmiaDetected = false;
    let useAmplitudeData = false;
    
    // Si tenemos datos de amplitud, priorizar este criterio
    if (amplitudesHistoryRef.current.length >= 3 && rrData.amplitude !== undefined) {
      useAmplitudeData = true;
      
      // Calcular línea base de amplitud (promedio de las 3 mayores amplitudes)
      const sortedAmps = [...amplitudesHistoryRef.current].sort((a, b) => b - a);
      const normalAmplitude = (sortedAmps[0] + sortedAmps[1] + sortedAmps[2]) / 3;
      
      // Ratio de amplitud actual vs línea base
      const ampRatio = rrData.amplitude / normalAmplitude;
      
      // Patrones específicos de arritmia
      // - Amplitud significativamente menor que la normal
      // - RR anormalmente corto seguido de uno largo
      if (ampRatio < 0.6 && rrVariation > 0.15) {
        arrhythmiaDetected = true;
        ArrhythmiaDiagnostics.logDetection({
          type: 'AmplitudeBasedDetection',
          ampRatio,
          rrVariation,
          amplitude: rrData.amplitude,
          normalAmplitude
        });
      }
    } 
    // Si no tenemos datos de amplitud, usar solo RR
    else {
      // NOTA: Priorizamos el detector principal, este es solo respaldo
      // Un latido prematuro típico es un RR corto seguido de uno compensatorio largo
      const last = rrHistoryRef.current[rrHistoryRef.current.length - 1];
      const secondLast = rrHistoryRef.current[rrHistoryRef.current.length - 2];
      
      if (secondLast && secondLast < baselineRef.current * 0.8 && 
          last > baselineRef.current * 1.2 && rmssd > 30) {
        arrhythmiaDetected = true;
        ArrhythmiaDiagnostics.logDetection({
          type: 'RRBasedDetection',
          shortRR: secondLast,
          longRR: last,
          baseline: baselineRef.current,
          rmssd
        });
      }
    }
    
    // Si se detectó una arritmia, actualizar contadores y estado
    if (arrhythmiaDetected && currentTime - lastDetectionTimeRef.current > 1000) {
      // Actualizar contador solo si ha pasado suficiente tiempo
      setArrhythmiaCounter(prevCount => Math.min(prevCount + 1, maxCount));
      lastDetectionTimeRef.current = currentTime;
      
      // Establecer tiempo de bloqueo para evitar detecciones múltiples
      detectionLockTimeRef.current = currentTime;
      
      return {
        detected: true,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
        lastArrhythmiaData: {
          timestamp: currentTime,
          rmssd,
          rrVariation
        }
      };
    }
    
    // Si no se detectó arritmia, devolver estado actual
    return {
      detected: false,
      arrhythmiaStatus: arrhythmiaCounter > 0 ? 
        `ARRITMIA DETECTADA|${arrhythmiaCounter}` : 
        `SIN ARRITMIAS|${arrhythmiaCounter}`
    };
  }, [arrhythmiaCounter]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
