import { useState, useRef, useCallback } from 'react';

/**
 * Hook para analizar arritmias en datos de frecuencia cardíaca
 * ACTUALIZADO: Sin límite de arritmias y mejor integración con ArrhythmiaDetector
 */
export const useArrhythmiaAnalyzer = () => {
  // Constants for arrhythmia detection - adjusted for better sensitivity
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 2; // Reduced from 3 to 2 for faster detection
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 300; // Reduced from 500ms to 300ms for more reliable counting
  const PREMATURE_BEAT_RATIO = 0.82; // Threshold for premature beat detection
  const COMPENSATORY_PAUSE_RATIO = 1.05; // Threshold for compensatory pause
  const AMPLITUDE_THRESHOLD_RATIO = 0.75; // Threshold for amplitude differences
  
  // State and refs
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  
  // Analysis buffers
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
   * ACTUALIZADO: Eliminado el límite MAX_ARRHYTHMIAS_PER_SESSION
   */
  const processArrhythmia = useCallback((rrData: { 
    intervals: number[], 
    lastPeakTime: number | null,
    amplitudes?: number[]
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
    
    // Check if middle beat is premature (shorter than expected)
    if (recentRR[1] < avgRR * PREMATURE_BEAT_RATIO) {
      detectionConfidence++;
      
      // Check for compensatory pause after premature beat
      if (recentRR[2] > avgRR * COMPENSATORY_PAUSE_RATIO) {
        detectionConfidence++;
      }
      
      // Check amplitude variations if available
      if (amplitudeBufferRef.current.length >= 3) {
        const recentAmplitudes = amplitudeBufferRef.current.slice(-3);
        const avgAmplitude = amplitudeBufferRef.current.reduce((sum, val) => sum + val, 0) / 
                            amplitudeBufferRef.current.length;
        
        // Check if premature beat has different amplitude
        if (Math.abs(recentAmplitudes[1] - avgAmplitude) / avgAmplitude > AMPLITUDE_THRESHOLD_RATIO) {
          detectionConfidence++;
        }
      }
    }
    
    // Determine if we have sufficient confidence for this to be a premature beat
    prematureBeatDetected = detectionConfidence >= ARRHYTHMIA_CONFIRMATION_THRESHOLD;
    
    // Only count as a new arrhythmia if it's been a while since the last one
    // This avoids counting the same premature beat multiple times
    const sufficientTimeSinceLastArrhythmia = 
      currentTime - lastArrhythmiaTime.current > MIN_TIME_BETWEEN_ARRHYTHMIAS;
    
    let increment = false;
    
    if (prematureBeatDetected && sufficientTimeSinceLastArrhythmia) {
      // ELIMINADO: Verificación de si hemos llegado al límite máximo
      // if (arrhythmiaCounter < MAX_ARRHYTHMIAS_PER_SESSION) {
        lastArrhythmiaTime.current = currentTime;
        increment = true;
        hasDetectedArrhythmia.current = true;
      // }
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
