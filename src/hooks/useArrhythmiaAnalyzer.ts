
import { useState, useRef, useCallback } from 'react';

/**
 * Hook for analyzing arrhythmias in heart rate data
 */
export const useArrhythmiaAnalyzer = () => {
  // Constants for arrhythmia detection - adjusted for better sensitivity
  const ANALYSIS_WINDOW_SIZE = 10; // Análisis sobre 10 latidos consecutivos
  const ARRHYTHMIA_CONFIRMATION_THRESHOLD = 2; // Reduced from 3 to 2 for faster detection
  const MIN_TIME_BETWEEN_ARRHYTHMIAS = 500; // Reduced from 800ms to 500ms for faster detection
  const PREMATURE_BEAT_RATIO = 0.82; // Increased from 0.78 to detect more subtle premature beats
  const COMPENSATORY_PAUSE_RATIO = 1.05; // Reduced from 1.10 to be more sensitive
  const AMPLITUDE_THRESHOLD_RATIO = 0.75; // Increased from 0.70 to detect more subtle amplitude changes
  
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
  
  // New variables for more effective detection
  const detectionSensitivityRef = useRef<number>(1.1); // Increased sensitivity multiplier
  
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
    
    // Enhanced baseline calculation method - use middle 70% of values (increased from 60%)
    const sortedRR = [...intervals].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedRR.length * 0.15); // Changed from 0.2 to 0.15
    const endIdx = Math.floor(sortedRR.length * 0.85); // Changed from 0.8 to 0.85
    const middleValues = sortedRR.slice(startIdx, endIdx);
    
    // Use median from middle values as baseline - more robust
    baselineRRIntervalRef.current = middleValues[Math.floor(middleValues.length / 2)];
    
    // If amplitudes available, calculate baseline
    if (amplitudes.length >= 5) {
      // Normal beats typically have higher amplitude than premature beats
      // Sort amplitudes in descending order and take top 70% (increased from 60%)
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a);
      const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.7);
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
    const recentIntervals = intervals.slice(-5); // Increased from 4 to 5
    const recentAmplitudes = amplitudes.slice(-5); // Increased from 4 to 5
    
    if (recentIntervals.length >= 3 && recentAmplitudes.length >= 3 && baselineRRIntervalRef.current > 0) {
      // Get current and previous beats information
      const current = recentIntervals[recentIntervals.length - 1];
      const previous = recentIntervals[recentIntervals.length - 2];
      const beforePrevious = recentIntervals[recentIntervals.length - 3];
      
      const currentAmp = recentAmplitudes[recentAmplitudes.length - 1];
      const previousAmp = recentAmplitudes[recentAmplitudes.length - 2];
      const beforePreviousAmp = recentAmplitudes[recentAmplitudes.length - 3];
      
      // Apply sensitivity multiplier to detection thresholds
      const adjustedPrematureRatio = PREMATURE_BEAT_RATIO * detectionSensitivityRef.current;
      const adjustedCompensatoryRatio = COMPENSATORY_PAUSE_RATIO / detectionSensitivityRef.current;
      const adjustedAmplitudeRatio = AMPLITUDE_THRESHOLD_RATIO * detectionSensitivityRef.current;
      
      // Calculate ratios compared to baseline
      const currentRatio = current / baselineRRIntervalRef.current;
      const previousRatio = previous / baselineRRIntervalRef.current;
      const currentAmpRatio = currentAmp / baselineAmplitudeRef.current;
      const previousAmpRatio = previousAmp / baselineAmplitudeRef.current;
      
      // Pattern 1: Classic premature beat (Normal - Premature - Compensatory)
      const isClassicPattern = 
        (previous < beforePrevious * adjustedPrematureRatio) && // Short premature beat
        (current > previous * adjustedCompensatoryRatio) &&     // Followed by compensatory pause
        (previousAmp < baselineAmplitudeRef.current * adjustedAmplitudeRatio); // Lower amplitude
      
      // Pattern 2: Single premature beat among normal beats
      const isSinglePremature = 
        (current < baselineRRIntervalRef.current * adjustedPrematureRatio) && // Current is premature
        (currentAmp < baselineAmplitudeRef.current * adjustedAmplitudeRatio) && // Low amplitude
        (previous >= baselineRRIntervalRef.current * 0.80); // Previous was normal (reduced from 0.85)
      
      // Pattern 3: Direct detection based on amplitude and RR differences
      const isAbnormalBeat = 
        (current < baselineRRIntervalRef.current * adjustedPrematureRatio) && // Short RR
        (currentAmp < baselineAmplitudeRef.current * adjustedAmplitudeRatio) && // Low amplitude
        (consecutiveNormalBeatsRef.current >= 1); // Reduced from 2 to 1 normal beat
      
      // NEW - Pattern 4: Small amplitude beat regardless of timing
      const isSmallBeat = 
        (currentAmp < baselineAmplitudeRef.current * 0.60) && // Very small amplitude
        (baselineAmplitudeRef.current > 0); // Only if we have established a baseline
      
      // Calculate confidence based on pattern match
      if (isClassicPattern) {
        prematureBeatConfidence = 0.95; // Increased from 0.90
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
        prematureBeatConfidence = 0.85; // Increased from 0.80
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
        prematureBeatConfidence = 0.80; // Increased from 0.75
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
      else if (isSmallBeat) {
        prematureBeatConfidence = 0.75;
        prematureBeatDetected = true;
        consecutiveNormalBeatsRef.current = 0;
        lastBeatsClassificationRef.current.push('premature');
        
        console.log('Small amplitude beat detected:', {
          amplitude: currentAmp,
          normalAmplitude: baselineAmplitudeRef.current,
          ratio: currentAmp / baselineAmplitudeRef.current,
          pattern: 'small-amplitude',
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
        arrhythmiaAnalysis.confidence >= 0.65 && // Reduced threshold for even more sensitivity 
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
