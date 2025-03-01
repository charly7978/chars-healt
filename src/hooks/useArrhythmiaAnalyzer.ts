
import { useState, useRef, useCallback } from 'react';

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  // Constants for arrhythmia detection
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 1000; // Mínimo 1 segundo entre arritmias
  const PREMATURE_BEAT_RATIO = 0.75; // Un latido prematuro es típicamente <= 75% del intervalo normal
  const COMPENSATORY_PAUSE_RATIO = 1.15; // Una pausa compensatoria es >= 115% del intervalo normal
  
  // State and refs
  const [arrhythmiaCounter, setArrhythmiaCounter] = useState(0);
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  
  // Analysis buffers
  const rrIntervalsHistoryRef = useRef<number[][]>([]);
  const amplitudesHistoryRef = useRef<number[][]>([]);
  const rmssdHistoryRef = useRef<number[]>([]);
  const rrVariationHistoryRef = useRef<number[]>([]);
  const baselineRRIntervalRef = useRef<number>(0);
  const baselineAmplitudeRef = useRef<number>(0);
  
  /**
   * Reset all analysis state
   */
  const reset = useCallback(() => {
    setArrhythmiaCounter(0);
    lastArrhythmiaTime.current = 0;
    hasDetectedArrhythmia.current = false;
    
    // Clear buffers
    rrIntervalsHistoryRef.current = [];
    amplitudesHistoryRef.current = [];
    rmssdHistoryRef.current = [];
    rrVariationHistoryRef.current = [];
    baselineRRIntervalRef.current = 0;
    baselineAmplitudeRef.current = 0;
    
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Calculate baseline values from a stable period of measurements
   */
  const calculateBaselines = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 5) return;
    
    // Use median to establish baseline RR to avoid outliers
    const sortedRR = [...intervals].sort((a, b) => a - b);
    baselineRRIntervalRef.current = sortedRR[Math.floor(sortedRR.length / 2)];
    
    // If amplitudes available, calculate baseline
    if (amplitudes.length >= 5) {
      // Normal beats typically have higher amplitude than premature beats
      // Sort amplitudes in descending order and take top 70% as normal
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a);
      const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.7);
      const normalAmplitudes = sortedAmplitudes.slice(0, normalBeatsCount);
      baselineAmplitudeRef.current = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
    }
  }, []);
  
  /**
   * Analyze RR intervals to detect premature beats (arrhythmias)
   */
  const analyzeArrhythmia = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 3) {
      return { detected: false, confidence: 0, prematureBeat: false };
    }
    
    // If we don't have a baseline yet, calculate it
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 5) {
      calculateBaselines(intervals, amplitudes);
    }
    
    // 1. Look for premature beat pattern (short RR followed by compensatory pause)
    let prematureBeatConfidence = 0;
    let prematureBeatDetected = false;
    
    // Get the most recent intervals and amplitudes
    const recentIntervals = intervals.slice(-3);
    const recentAmplitudes = amplitudes.slice(-3);
    
    if (recentIntervals.length >= 3 && baselineRRIntervalRef.current > 0) {
      // RR-interval pattern for premature beats:
      // Normal - Short - Compensatory Pause
      const normal = recentIntervals[0];
      const premature = recentIntervals[1];
      const compensatory = recentIntervals[2];
      
      // Check if the pattern matches typical premature beat characteristics
      const isShortInterval = premature < normal * PREMATURE_BEAT_RATIO;
      const isCompensatoryPause = compensatory > normal * COMPENSATORY_PAUSE_RATIO;
      
      // Additional confidence if we have amplitude data (premature beats often have lower amplitude)
      let amplitudeEvidence = 0;
      if (recentAmplitudes.length >= 3 && baselineAmplitudeRef.current > 0) {
        const normalAmp = recentAmplitudes[0];
        const prematureAmp = recentAmplitudes[1];
        
        // Premature beats typically have lower amplitude than normal beats
        if (prematureAmp < normalAmp * 0.7) {
          amplitudeEvidence = 0.3;  // Add 30% confidence if amplitude is significantly lower
        }
      }
      
      // Calculate confidence based on timing pattern
      if (isShortInterval && isCompensatoryPause) {
        prematureBeatConfidence = 0.7 + amplitudeEvidence;
        
        // Strong evidence of a premature beat
        if (prematureBeatConfidence >= 0.75) {
          prematureBeatDetected = true;
          
          console.log('Premature beat detected:', {
            normal,
            premature,
            compensatory,
            normalToPrematuredRatio: premature / normal,
            normalToCompensatoryRatio: compensatory / normal,
            amplitudeEvidence,
            confidence: prematureBeatConfidence
          });
        }
      }
    }
    
    // 2. Calculate RMSSD (traditional variability metric) as a backup
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += Math.pow(diff, 2);
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
    
    // 3. Calculate average RR interval and its coefficient of variation
    const avgRR = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const rrStandardDeviation = Math.sqrt(
      recentIntervals.reduce((sum, rr) => sum + Math.pow(rr - avgRR, 2), 0) / recentIntervals.length
    );
    const coefficientOfVariation = rrStandardDeviation / avgRR;
    
    // Store data for trend analysis
    rmssdHistoryRef.current.push(rmssd);
    if (rmssdHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rmssdHistoryRef.current.shift();
    }
    
    rrVariationHistoryRef.current.push(coefficientOfVariation);
    if (rrVariationHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrVariationHistoryRef.current.shift();
    }
    
    return {
      detected: prematureBeatDetected,
      confidence: prematureBeatConfidence,
      prematureBeat: prematureBeatDetected,
      rmssd,
      rrVariation: coefficientOfVariation
    };
  }, [calculateBaselines]);
  
  /**
   * Process new RR interval data and update arrhythmia state
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] },
    maxArrhythmias: number = 15
  ) => {
    if (!rrData?.intervals || rrData.intervals.length < 3) {
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    // Store interval history for trend analysis
    rrIntervalsHistoryRef.current.push([...rrData.intervals]);
    if (rrIntervalsHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
      rrIntervalsHistoryRef.current.shift();
    }
    
    // Store amplitude history if available
    if (rrData.amplitudes && rrData.amplitudes.length > 0) {
      amplitudesHistoryRef.current.push([...rrData.amplitudes]);
      if (amplitudesHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
        amplitudesHistoryRef.current.shift();
      }
    }
    
    const currentTime = Date.now();
    const arrhythmiaAnalysis = analyzeArrhythmia(
      rrData.intervals, 
      rrData.amplitudes || []
    );
    
    // If a premature beat is detected and enough time has passed since the last one
    if (arrhythmiaAnalysis.detected && 
        arrhythmiaAnalysis.confidence >= 0.75 && 
        currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
        arrhythmiaCounter < maxArrhythmias) {
      
      hasDetectedArrhythmia.current = true;
      setArrhythmiaCounter(prev => prev + 1);
      lastArrhythmiaTime.current = currentTime;
      
      console.log("Arritmia (latido prematuro) detectada:", {
        rmssd: arrhythmiaAnalysis.rmssd,
        rrVariation: arrhythmiaAnalysis.rrVariation,
        confidence: arrhythmiaAnalysis.confidence,
        intervals: rrData.intervals.slice(-3),
        amplitudes: rrData.amplitudes?.slice(-3) || [],
        counter: arrhythmiaCounter + 1
      });

      return {
        detected: true,
        arrhythmiaStatus: `ARRITMIA DETECTADA|${arrhythmiaCounter + 1}`,
        lastArrhythmiaData: {
          timestamp: currentTime,
          rmssd: arrhythmiaAnalysis.rmssd,
          rrVariation: arrhythmiaAnalysis.rrVariation,
          isPrematureBeat: true
        }
      };
    }
    
    // If we've already detected an arrhythmia, maintain the count in status
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
