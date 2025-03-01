
import { useState, useRef, useCallback } from 'react';

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  // Constants for arrhythmia detection - adjusted for better sensitivity
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 3; // Requiere confirmación en al menos 3 ciclos
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 800; // Reduced from 1000ms to 800ms for faster detection
  const PREMATURE_BEAT_RATIO = 0.78; // Increased from 0.75 to detect more subtle premature beats
  const COMPENSATORY_PAUSE_RATIO = 1.10; // Reduced from 1.15 to be more sensitive
  const AMPLITUDE_THRESHOLD_RATIO = 0.70; // Added explicit amplitude ratio
  
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
  
  // Enhanced tracking for better detection
  const consecutiveNormalBeatsRef = useRef<number>(0);
  const lastBeatsClassificationRef = useRef<Array<'normal' | 'premature'>>([]);
  
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
    consecutiveNormalBeatsRef.current = 0;
    lastBeatsClassificationRef.current = [];
    
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Calculate baseline values from a stable period of measurements
   */
  const calculateBaselines = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 5) return;
    
    // Enhanced baseline calculation method - use middle 60% of values
    const sortedRR = [...intervals].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedRR.length * 0.2);
    const endIdx = Math.floor(sortedRR.length * 0.8);
    const middleValues = sortedRR.slice(startIdx, endIdx);
    
    // Use median from middle values as baseline - more robust
    baselineRRIntervalRef.current = middleValues[Math.floor(middleValues.length / 2)];
    
    // If amplitudes available, calculate baseline
    if (amplitudes.length >= 5) {
      // Normal beats typically have higher amplitude than premature beats
      // Sort amplitudes in descending order and take top 60%
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a);
      const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.6);
      const normalAmplitudes = sortedAmplitudes.slice(0, normalBeatsCount);
      baselineAmplitudeRef.current = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
      
      console.log("Arrhythmia analyzer - Baseline values calculated:", {
        baselineRRInterval: baselineRRIntervalRef.current,
        baselineAmplitude: baselineAmplitudeRef.current,
        sampleSize: intervals.length
      });
    }
  }, []);
  
  /**
   * Analyze RR intervals to detect premature beats (arrhythmias)
   */
  const analyzeArrhythmia = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 3) {
      return { detected: false, confidence: 0, prematureBeat: false };
    }
    
    // If we don't have a baseline yet and have enough samples, calculate it
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 5) {
      calculateBaselines(intervals, amplitudes);
    }
    
    // Enhanced detection of premature beat patterns
    let prematureBeatConfidence = 0;
    let prematureBeatDetected = false;
    
    // Get the most recent intervals and amplitudes for analysis
    const recentIntervals = intervals.slice(-4);
    const recentAmplitudes = amplitudes.slice(-4);
    
    if (recentIntervals.length >= 3 && recentAmplitudes.length >= 3 && baselineRRIntervalRef.current > 0) {
      // Get current and previous beats information
      const current = recentIntervals[recentIntervals.length - 1];
      const previous = recentIntervals[recentIntervals.length - 2];
      const beforePrevious = recentIntervals[recentIntervals.length - 3];
      
      const currentAmp = recentAmplitudes[recentAmplitudes.length - 1];
      const previousAmp = recentAmplitudes[recentAmplitudes.length - 2];
      const beforePreviousAmp = recentAmplitudes[recentAmplitudes.length - 3];
      
      // Calculate ratios compared to baseline
      const currentRatio = current / baselineRRIntervalRef.current;
      const previousRatio = previous / baselineRRIntervalRef.current;
      const currentAmpRatio = currentAmp / baselineAmplitudeRef.current;
      const previousAmpRatio = previousAmp / baselineAmplitudeRef.current;
      
      // Pattern 1: Classic premature beat (Normal - Premature - Compensatory)
      const isClassicPattern = 
        (previous < beforePrevious * PREMATURE_BEAT_RATIO) && // Short premature beat
        (current > previous * COMPENSATORY_PAUSE_RATIO) &&   // Followed by compensatory pause
        (previousAmp < baselineAmplitudeRef.current * AMPLITUDE_THRESHOLD_RATIO); // Lower amplitude
      
      // Pattern 2: Single premature beat among normal beats
      const isSinglePremature = 
        (current < baselineRRIntervalRef.current * PREMATURE_BEAT_RATIO) && // Current is premature
        (currentAmp < baselineAmplitudeRef.current * AMPLITUDE_THRESHOLD_RATIO) && // Low amplitude
        (previous >= baselineRRIntervalRef.current * 0.85); // Previous was normal
      
      // Pattern 3: Direct detection based on amplitude and RR differences
      const isAbnormalBeat = 
        (current < baselineRRIntervalRef.current * PREMATURE_BEAT_RATIO) && // Short RR
        (currentAmp < baselineAmplitudeRef.current * AMPLITUDE_THRESHOLD_RATIO) && // Low amplitude
        (consecutiveNormalBeatsRef.current >= 2); // After some normal beats
      
      // Calculate confidence based on pattern match
      if (isClassicPattern) {
        prematureBeatConfidence = 0.90; // High confidence for classic pattern
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Classic premature beat pattern detected:', {
          normal: beforePrevious,
          premature: previous,
          compensatory: current,
          normalAmp: beforePreviousAmp,
          prematureAmp: previousAmp,
          pattern: 'classic',
          confidence: prematureBeatConfidence
        });
      } 
      else if (isSinglePremature) {
        prematureBeatConfidence = 0.80; // Good confidence for single premature
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Single premature beat detected:', {
          normal: previous,
          premature: current,
          normalAmp: previousAmp,
          prematureAmp: currentAmp,
          pattern: 'single',
          confidence: prematureBeatConfidence
        });
      }
      else if (isAbnormalBeat) {
        prematureBeatConfidence = 0.75; // Moderate confidence
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Abnormal beat detected:', {
          abnormal: current,
          baseline: baselineRRIntervalRef.current,
          abnormalAmp: currentAmp,
          baselineAmp: baselineAmplitudeRef.current,
          pattern: 'abnormal',
          confidence: prematureBeatConfidence
        });
      }
      else {
        // Normal beat
        consecutiveNormalBeatsRef.current++;
        lastBeatsClassificationRef.current.push('normal');
      }
      
      // Limit history size
      if (lastBeatsClassificationRef.current.length > 8) {
        lastBeatsClassificationRef.current.shift();
      }
    }
    
    // Calculate additional metrics for monitoring
    let rmssd = 0;
    let rrVariation = 0;
    
    if (recentIntervals.length >= 3) {
      // Calculate RMSSD
      let sumSquaredDiff = 0;
      for (let i = 1; i < recentIntervals.length; i++) {
        const diff = recentIntervals[i] - recentIntervals[i-1];
        sumSquaredDiff += Math.pow(diff, 2);
      }
      rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
      
      // Calculate variation from baseline
      if (baselineRRIntervalRef.current > 0) {
        const latest = recentIntervals[recentIntervals.length - 1];
        rrVariation = Math.abs(latest - baselineRRIntervalRef.current) / baselineRRIntervalRef.current;
      }
      
      // Store for trend analysis
      rmssdHistoryRef.current.push(rmssd);
      rrVariationHistoryRef.current.push(rrVariation);
      
      // Limit history size
      if (rmssdHistoryRef.current.length > ANALYSIS_WINDOW_SIZE) {
        rmssdHistoryRef.current.shift();
        rrVariationHistoryRef.current.shift();
      }
    }
    
    return {
      detected: prematureBeatDetected,
      confidence: prematureBeatConfidence,
      prematureBeat: prematureBeatDetected,
      rmssd,
      rrVariation
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
    
    // If a premature beat is detected with sufficient confidence
    // and enough time has passed since the last one
    if (arrhythmiaAnalysis.detected && 
        arrhythmiaAnalysis.confidence >= 0.70 && // Reduced threshold for more sensitivity 
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
