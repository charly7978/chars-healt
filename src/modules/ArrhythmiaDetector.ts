
export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 2000; // Reduced from 3000ms to detect earlier
  
  // More sensitive constants for premature beat detection
  private readonly PREMATURE_BEAT_THRESHOLD = 0.80; // Increased from 0.75 to be even more sensitive
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.80; // Increased from 0.70 to detect more subtle premature beats
  private readonly POST_PREMATURE_THRESHOLD = 1.10; // Reduced from 1.15 to be even more sensitive
  
  // State variables
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Store amplitudes to detect small beats
  private isLearningPhase = true;
  private hasDetectedFirstArrhythmia = false;
  private arrhythmiaDetected = false;
  private measurementStartTime: number = Date.now();
  private arrhythmiaCount = 0;
  private lastRMSSD: number = 0;
  private lastRRVariation: number = 0;
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;
  private avgNormalAmplitude: number = 0;
  private baseRRInterval: number = 0; // Average normal RR interval
  
  // New tracking variables to improve detection
  private consecutiveNormalBeats: number = 0;
  private lastBeatsClassification: Array<'normal' | 'premature'> = [];
  
  // New variables for more robust detection
  private recentRRIntervals: number[] = [];
  private detectionSensitivity: number = 1.0; // Increased sensitivity multiplier
  
  /**
   * Reset all state variables
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.consecutiveNormalBeats = 0;
    this.lastBeatsClassification = [];
  }

  /**
   * Check if in learning phase
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD;
  }

  /**
   * Update learning phase status
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
        
        // Calculate base values after learning phase
        if (this.rrIntervals.length > 5) {
          // Enhanced baseline calculation method - now uses more aggressive filtering
          // Sort intervals to find the median value (more robust than mean)
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // Take the middle 70% of values (expanded from 60%)
          const startIdx = Math.floor(sortedRR.length * 0.15);
          const endIdx = Math.floor(sortedRR.length * 0.85);
          const middleValues = sortedRR.slice(startIdx, endIdx);
          
          // Calculate median from the middle values
          this.baseRRInterval = middleValues[Math.floor(middleValues.length / 2)];
          
          // Calculate average normal amplitude using enhanced method
          if (this.amplitudes.length > 5) {
            // Sort amplitudes in descending order (highest first)
            const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
            
            // Use top 70% of amplitudes as reference for normal beats (expanded from 60%)
            const normalCount = Math.ceil(sortedAmplitudes.length * 0.7);
            const normalAmplitudes = sortedAmplitudes.slice(0, normalCount);
            this.avgNormalAmplitude = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
            
            console.log('ArrhythmiaDetector - Enhanced baseline values calculated:', {
              baseRRInterval: this.baseRRInterval,
              avgNormalAmplitude: this.avgNormalAmplitude,
              totalSamples: this.rrIntervals.length
            });
          }
        }
      }
    }
  }

  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    this.rrIntervals = intervals;
    this.lastPeakTime = lastPeakTime;
    
    // Store peak amplitude if provided
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(Math.abs(peakAmplitude));
      
      // Keep the same number of amplitudes as intervals
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    // Update recent RR intervals for trend analysis
    if (intervals.length > 0) {
      const latestRR = intervals[intervals.length - 1];
      this.recentRRIntervals.push(latestRR);
      if (this.recentRRIntervals.length > 10) {
        this.recentRRIntervals.shift();
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * Detect arrhythmia based on premature beat patterns - ENHANCED SENSITIVITY
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Skip detection during learning phase or if not enough data
    if (this.rrIntervals.length < 3 || this.amplitudes.length < 3 || this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calculate RMSSD (we'll still keep this for reference)
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    // Get the last 5 RR intervals and amplitudes for enhanced pattern analysis (increased from 4)
    const lastRRs = this.rrIntervals.slice(-5);
    const lastAmplitudes = this.amplitudes.slice(-5);
    
    // Enhanced premature beat detection logic with increased sensitivity
    let prematureBeatDetected = false;
    
    // We need at least 3 intervals to detect patterns
    if (lastRRs.length >= 3 && lastAmplitudes.length >= 3 && this.baseRRInterval > 0) {
      // Analyze most recent intervals in context of previous ones
      const currentRR = lastRRs[lastRRs.length - 1];
      const previousRR = lastRRs[lastRRs.length - 2];
      const beforePreviousRR = lastRRs[lastRRs.length - 3];
      
      // Get corresponding amplitudes
      const currentAmplitude = lastAmplitudes[lastAmplitudes.length - 1];
      const previousAmplitude = lastAmplitudes[lastAmplitudes.length - 2];
      const beforePreviousAmplitude = lastAmplitudes[lastAmplitudes.length - 3];
      
      // Calculate ratios compared to baseline - with increased sensitivity
      const currentRRRatio = currentRR / this.baseRRInterval;
      const previousRRRatio = previousRR / this.baseRRInterval;
      const currentAmplitudeRatio = currentAmplitude / this.avgNormalAmplitude;
      const previousAmplitudeRatio = previousAmplitude / this.avgNormalAmplitude;
      
      // ENHANCED: New super-sensitive threshold adjusted by sensitivity multiplier
      const prematureThreshold = this.PREMATURE_BEAT_THRESHOLD * this.detectionSensitivity;
      const amplitudeThreshold = this.AMPLITUDE_RATIO_THRESHOLD * this.detectionSensitivity;
      const postPrematureThreshold = this.POST_PREMATURE_THRESHOLD / this.detectionSensitivity;
      
      // Pattern 1: Normal - Premature - Compensatory (Classic pattern)
      // A short RR interval with low amplitude followed by a longer compensatory pause
      const isPrematurePattern = 
        (previousRR < beforePreviousRR * prematureThreshold) && // Short interval
        (currentRR > previousRR * postPrematureThreshold) &&    // Compensatory pause
        (previousAmplitude < this.avgNormalAmplitude * amplitudeThreshold); // Lower amplitude
      
      // Pattern 2: Premature beat followed by normal rhythm (more sensitive detection)
      const isPrematureNormalPattern =
        (currentRR < this.baseRRInterval * prematureThreshold) && // Current interval is short
        (currentAmplitude < this.avgNormalAmplitude * amplitudeThreshold) && // Lower amplitude
        (previousRR >= this.baseRRInterval * 0.85); // Previous beat was normal or nearly normal
      
      // Pattern 3: Direct comparison to baseline (most sensitive)
      const isAbnormalBeat = 
        (currentRR < this.baseRRInterval * prematureThreshold) && // Short RR interval
        (currentAmplitude < this.avgNormalAmplitude * amplitudeThreshold) && // Lower amplitude
        this.consecutiveNormalBeats >= 1; // Only need 1 normal beat now (reduced from 2)
      
      // NEW - Pattern 4: Detect small amplitude beat regardless of timing
      const isSmallBeat = 
        (currentAmplitude < this.avgNormalAmplitude * 0.65) && // Very small amplitude
        (this.avgNormalAmplitude > 0); // Only if we have established a baseline
      
      // Check which pattern is detected
      if (isPrematurePattern) {
        prematureBeatDetected = true;
        this.consecutiveNormalBeats = 0;
        this.lastBeatsClassification.push('premature');
        
        console.log('ArrhythmiaDetector - Classic premature beat pattern detected:', {
          normalRR: beforePreviousRR,
          prematureRR: previousRR,
          compensatoryRR: currentRR,
          normalAmplitude: this.avgNormalAmplitude,
          prematureAmplitude: previousAmplitude,
          amplitudeRatio: previousAmplitude / this.avgNormalAmplitude
        });
      } 
      else if (isPrematureNormalPattern) {
        prematureBeatDetected = true;
        this.consecutiveNormalBeats = 0;
        this.lastBeatsClassification.push('premature');
        
        console.log('ArrhythmiaDetector - Premature-Normal pattern detected:', {
          prematureRR: currentRR,
          normalRR: previousRR,
          prematureAmplitude: currentAmplitude,
          normalAmplitude: previousAmplitude,
          rrRatio: currentRR / this.baseRRInterval,
          amplitudeRatio: currentAmplitude / this.avgNormalAmplitude
        });
      }
      else if (isAbnormalBeat) {
        prematureBeatDetected = true;
        this.consecutiveNormalBeats = 0;
        this.lastBeatsClassification.push('premature');
        
        console.log('ArrhythmiaDetector - Abnormal beat detected:', {
          abnormalRR: currentRR,
          baseRR: this.baseRRInterval,
          rrRatio: currentRRRatio,
          abnormalAmplitude: currentAmplitude,
          baseAmplitude: this.avgNormalAmplitude,
          amplitudeRatio: currentAmplitudeRatio
        });
      }
      else if (isSmallBeat) {
        prematureBeatDetected = true;
        this.consecutiveNormalBeats = 0;
        this.lastBeatsClassification.push('premature');
        
        console.log('ArrhythmiaDetector - Small amplitude beat detected:', {
          amplitude: currentAmplitude,
          normalAmplitude: this.avgNormalAmplitude,
          ratio: currentAmplitude / this.avgNormalAmplitude
        });
      }
      else {
        // Normal beat, update tracking
        this.consecutiveNormalBeats++;
        this.lastBeatsClassification.push('normal');
      }
      
      // Keep last 8 classifications for trend analysis
      if (this.lastBeatsClassification.length > 8) {
        this.lastBeatsClassification.shift();
      }
    }
    
    // Use all detection methods, also considering the last RR variation
    const rrVariation = Math.abs(lastRRs[lastRRs.length - 1] - this.baseRRInterval) / this.baseRRInterval;
    this.lastRRVariation = rrVariation;
    
    // ENHANCED: Only register as a new arrhythmia if it's been at least 500ms since the last one
    // (reduced from 1000ms to catch more closely spaced arrhythmias)
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 500) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      
      // Mark that we've detected the first arrhythmia
      this.hasDetectedFirstArrhythmia = true;
      
      console.log('ArrhythmiaDetector - New arrhythmia (premature beat) detected:', {
        count: this.arrhythmiaCount,
        rmssd,
        rrVariation,
        timestamp: currentTime,
        intervals: lastRRs,
        amplitudes: lastAmplitudes
      });
    }

    this.arrhythmiaDetected = prematureBeatDetected;

    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: this.arrhythmiaDetected ? { rmssd, rrVariation, prematureBeat: true } : null
    };
  }

  /**
   * Get current arrhythmia status
   */
  getStatus(): string {
    return this.hasDetectedFirstArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Get current arrhythmia count
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
}
