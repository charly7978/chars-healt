import { useState, useRef, useCallback } from 'react';

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
  const lastArrhythmiaTime = useRef<number>(0);
  const hasDetectedArrhythmia = useRef<boolean>(false);
  
  // Analysis buffers
  const rrIntervalsHistoryRef = useRef<number[][]>([]);
  const amplitudesHistoryRef = useRef<number[][]>([]);
  const rmssdHistoryRef = useRef<number[]>([]);
  const rrVariationHistoryRef = useRef<number[]>([]);
  const baselineRRIntervalRef = useRef<number>(0);
  const baselineAmplitudeRef = useRef<number>(0);
  
  // Normal beat tracking to ensure we only detect premature beats between normal beats
  const normalBeatsAmplitudesRef = useRef<number[]>([]);
  const normalBeatsRRsRef = useRef<number[]>([]);
  
  // DEBUG flag to track detection issues
  const DEBUG_MODE = true;
  
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
    normalBeatsAmplitudesRef.current = [];
    normalBeatsRRsRef.current = [];
    
    console.log("Arrhythmia analyzer reset");
  }, []);
  
  /**
   * Calculate baseline values from a stable period of measurements
   */
  const calculateBaselines = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 5) return;
    
    // Enhanced baseline calculation method - use middle values for robustness
    const sortedRR = [...intervals].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedRR.length * 0.15);
    const endIdx = Math.floor(sortedRR.length * 0.85);
    const middleValues = sortedRR.slice(startIdx, endIdx);
    
    // Use median from middle values as baseline - more robust
    baselineRRIntervalRef.current = middleValues[Math.floor(middleValues.length / 2)];
    
    // If amplitudes available, calculate baseline
    if (amplitudes.length >= 5) {
      // Normal beats typically have higher amplitude than premature beats
      // Sort amplitudes in descending order and take top 60% (refined from 70%)
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a);
      const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.6);
      const normalAmplitudes = sortedAmplitudes.slice(0, normalBeatsCount);
      baselineAmplitudeRef.current = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
      
      console.log("Arrhythmia analyzer - Baseline values calculated:", {
        baselineRRInterval: baselineRRIntervalRef.current,
        baselineAmplitude: baselineAmplitudeRef.current,
        sampleSize: intervals.length
      });
    } else if (DEBUG_MODE) {
      // Generate amplitudes if not available
      baselineAmplitudeRef.current = 100; // Default value
      console.log("Arrhythmia analyzer - No amplitudes available, using default baseline");
    }
  }, [DEBUG_MODE]);
  
  /**
   * Identify a single beat as normal or premature
   */
  const classifyBeat = useCallback((
    beatRR: number, 
    beatAmplitude: number, 
    prevBeatsRRs: number[] = [], 
    prevBeatsAmplitudes: number[] = []
  ) => {
    if (baselineRRIntervalRef.current <= 0 || baselineAmplitudeRef.current <= 0) {
      return 'unknown';
    }
    
    // Calculate current normal amplitude based on recent normal beats
    let currentNormalAmplitude = baselineAmplitudeRef.current;
    if (normalBeatsAmplitudesRef.current.length >= 3) {
      currentNormalAmplitude = normalBeatsAmplitudesRef.current.reduce((a, b) => a + b, 0) / 
                           normalBeatsAmplitudesRef.current.length;
    }
    
    // A beat is normal if:
    // 1. Its amplitude is close to or above the average normal amplitude
    // 2. Its RR interval is close to the baseline RR interval
    if (beatAmplitude >= currentNormalAmplitude * 0.85 &&
        (beatRR === 0 || (beatRR >= baselineRRIntervalRef.current * 0.85 && 
                         beatRR <= baselineRRIntervalRef.current * 1.15))) {
      
      // Update normal beats tracking
      normalBeatsAmplitudesRef.current.push(beatAmplitude);
      normalBeatsRRsRef.current.push(beatRR);
      
      // Keep limited history
      if (normalBeatsAmplitudesRef.current.length > 5) {
        normalBeatsAmplitudesRef.current.shift();
        normalBeatsRRsRef.current.shift();
      }
      
      return 'normal';
    }
    
    // A beat is premature if:
    // 1. Its amplitude is significantly smaller than normal beats (main criteria)
    // 2. We have at least one normal beat in our history
    const amplitudeRatio = beatAmplitude / currentNormalAmplitude;
    if (amplitudeRatio < AMPLITUDE_THRESHOLD_RATIO && normalBeatsAmplitudesRef.current.length > 0) {
      return 'premature';
    }
    
    // If we can't classify, mark as unknown
    return 'unknown';
  }, []);
  
  /**
   * Analyze a sequence of beats to detect arrhythmia patterns
   */
  const analyzeArrhythmia = useCallback((intervals: number[], amplitudes: number[] = []) => {
    if (intervals.length < 4 || amplitudes.length < 4) {
      return { detected: false, confidence: 0, prematureBeat: false };
    }
    
    // If no baseline established and we have enough data, calculate it
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 5) {
      calculateBaselines(intervals, amplitudes);
    }
    
    // If still no baseline, calculate it now with what we have
    if (baselineRRIntervalRef.current === 0 && intervals.length >= 4) {
      const sortedRRs = [...intervals].sort((a, b) => a - b);
      baselineRRIntervalRef.current = sortedRRs[Math.floor(sortedRRs.length / 2)];
      
      if (amplitudes.length >= 4) {
        const sortedAmps = [...amplitudes].sort((a, b) => b - a);
        baselineAmplitudeRef.current = sortedAmps.slice(0, Math.ceil(sortedAmps.length * 0.6))
          .reduce((a, b) => a + b, 0) / Math.ceil(sortedAmps.length * 0.6);
      } else {
        baselineAmplitudeRef.current = 100; // Default value
      }
    }
    
    // Get the latest beat data
    const recentIntervals = intervals.slice(-4);
    const recentAmplitudes = amplitudes.slice(-4);
    
    // Identify the latest beat
    const latestBeatRR = recentIntervals[recentIntervals.length - 1];
    const latestBeatAmplitude = recentAmplitudes[recentAmplitudes.length - 1];
    
    // Create beat data with classification
    const beatsData = recentAmplitudes.map((amp, i) => ({
      amplitude: amp,
      rr: i < recentIntervals.length ? recentIntervals[i] : 0,
      index: i,
      classification: classifyBeat(
        i < recentIntervals.length ? recentIntervals[i] : 0,
        amp,
        recentIntervals.slice(0, i),
        recentAmplitudes.slice(0, i)
      )
    }));
    
    let prematureBeatDetected = false;
    let confidence = 0;
    
    // Check if the latest beat is premature and if it's between normal beats
    const latestBeat = beatsData[beatsData.length - 1];
    
    if (latestBeat.classification === 'premature') {
      // Find the most recent normal beat before this one
      const prevNormalBeat = beatsData
        .slice(0, -1)
        .filter(beat => beat.classification === 'normal')
        .sort((a, b) => b.index - a.index)[0];
      
      if (prevNormalBeat) {
        prematureBeatDetected = true;
        confidence = 0.85;
        
        console.log('Arrhythmia analyzer - PREMATURE BEAT DETECTED:', {
          beatIndex: latestBeat.index,
          prematureAmplitude: latestBeat.amplitude,
          normalAmplitude: prevNormalBeat.amplitude,
          amplitudeRatio: latestBeat.amplitude / prevNormalBeat.amplitude,
          prevNormalBeatIndex: prevNormalBeat.index
        });
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
      confidence: confidence,
      prematureBeat: prematureBeatDetected,
      rmssd,
      rrVariation
    };
  }, [calculateBaselines, classifyBeat]);
  
  /**
   * Process new RR interval data and update arrhythmia state
   */
  const processArrhythmia = useCallback((
    rrData: { intervals: number[], lastPeakTime: number | null, amplitudes?: number[] },
    maxArrhythmias: number = 15
  ) => {
    // Check if we have valid interval data
    if (!rrData?.intervals || rrData.intervals.length === 0) {
      if (DEBUG_MODE) console.warn("Arrhythmia analyzer - No interval data provided");
      
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    // Filter out invalid intervals
    const validIntervals = rrData.intervals.filter(interval => interval > 0);
    
    if (validIntervals.length < 4) {
      if (DEBUG_MODE) console.warn("Arrhythmia analyzer - Not enough valid intervals:", validIntervals);
      
      return {
        detected: false,
        arrhythmiaStatus: hasDetectedArrhythmia.current 
          ? `ARRITMIA DETECTADA|${arrhythmiaCounter}`
          : `SIN ARRITMIAS|${arrhythmiaCounter}`,
        lastArrhythmiaData: null
      };
    }
    
    // Store interval history for trend analysis
    rrIntervalsHistoryRef.current.push([...validIntervals]);
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
      validIntervals, 
      rrData.amplitudes || []
    );
    
    // If we detect an arrhythmia and enough time has passed since the last one
    if (arrhythmiaAnalysis.detected && 
        arrhythmiaAnalysis.confidence >= 0.75 && 
        currentTime - lastArrhythmiaTime.current >= MIN_TIME_BETWEEN_ARRHYTHMIAS &&
        arrhythmiaCounter < maxArrhythmias) {
      
      hasDetectedArrhythmia.current = true;
      setArrhythmiaCounter(prev => prev + 1);
      lastArrhythmiaTime.current = currentTime;
      
      console.log("NEW ARRHYTHMIA COUNTED IN HOOK:", {
        rmssd: arrhythmiaAnalysis.rmssd,
        rrVariation: arrhythmiaAnalysis.rrVariation,
        confidence: arrhythmiaAnalysis.confidence,
        intervals: validIntervals.slice(-3),
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
  }, [arrhythmiaCounter, analyzeArrhythmia, DEBUG_MODE, MIN_TIME_BETWEEN_ARRHYTHMIAS]);
  
  return {
    processArrhythmia,
    reset,
    arrhythmiaCounter
  };
};
