export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  
  // Adjusted constants for premature beat detection
  private readonly PREMATURE_BEAT_THRESHOLD = 0.75; // Increased from 0.70 to be more sensitive
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.70; // Increased from 0.60 to detect more subtle premature beats
  private readonly POST_PREMATURE_THRESHOLD = 1.15; // Reduced from 1.20 to be more sensitive
  
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
          // Enhanced baseline calculation method
          // Sort intervals to find the median value (more robust than mean)
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // Take the middle 60% of values to avoid outliers
          const startIdx = Math.floor(sortedRR.length * 0.2);
          const endIdx = Math.floor(sortedRR.length * 0.8);
          const middleValues = sortedRR.slice(startIdx, endIdx);
          
          // Calculate median from the middle values
          this.baseRRInterval = middleValues[Math.floor(middleValues.length / 2)];
          
          // Calculate average normal amplitude using enhanced method
          if (this.amplitudes.length > 5) {
            // Sort amplitudes in descending order (highest first)
            const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
            
            // Use top 60% of amplitudes as reference for normal beats
            const normalCount = Math.ceil(sortedAmplitudes.length * 0.6);
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
    
    this.updateLearningPhase();
  }

  /**
   * Detect arrhythmia based on premature beat patterns
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
    
    // Get the last 4 RR intervals and amplitudes for enhanced pattern analysis
    const lastRRs = this.rrIntervals.slice(-4);
    const lastAmplitudes = this.amplitudes.slice(-4);
    
    // Enhanced premature beat detection logic
    let prematureBeatDetected = false;
    
    // We need at least 3 intervals to detect patterns
    if (lastRRs.length >= 3 && lastAmplitudes.length >= 3 && this.baseRRInterval > 0) {
      // Analyze most recent interval in context of previous ones
      const currentRR = lastRRs[lastRRs.length - 1];
      const previousRR = lastRRs[lastRRs.length - 2];
      const beforePreviousRR = lastRRs[lastRRs.length - 3];
      
      // Get corresponding amplitudes
      const currentAmplitude = lastAmplitudes[lastAmplitudes.length - 1];
      const previousAmplitude = lastAmplitudes[lastAmplitudes.length - 2];
      const beforePreviousAmplitude = lastAmplitudes[lastAmplitudes.length - 3];
      
      // Calculate ratios compared to baseline
      const currentRRRatio = currentRR / this.baseRRInterval;
      const previousRRRatio = previousRR / this.baseRRInterval;
      const currentAmplitudeRatio = currentAmplitude / this.avgNormalAmplitude;
      const previousAmplitudeRatio = previousAmplitude / this.avgNormalAmplitude;
      
      // Pattern 1: Normal - Premature - Compensatory
      // A short RR interval with low amplitude followed by a longer compensatory pause
      const isPrematurePattern = 
        (previousRR < beforePreviousRR * this.PREMATURE_BEAT_THRESHOLD) && // Short interval
        (currentRR > previousRR * this.POST_PREMATURE_THRESHOLD) &&        // Compensatory pause
        (previousAmplitude < this.avgNormalAmplitude * this.AMPLITUDE_RATIO_THRESHOLD); // Lower amplitude
      
      // Pattern 2: Premature beat followed by normal rhythm (more sensitive detection)
      const isPrematureNormalPattern =
        (currentRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD) && // Current interval is short
        (currentAmplitude < this.avgNormalAmplitude * this.AMPLITUDE_RATIO_THRESHOLD) && // Lower amplitude
        (previousRR >= this.baseRRInterval * 0.85); // Previous beat was normal or nearly normal
      
      // Pattern 3: Direct comparison to baseline
      const isAbnormalBeat = 
        (currentRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD) && // Short RR interval
        (currentAmplitude < this.avgNormalAmplitude * this.AMPLITUDE_RATIO_THRESHOLD) && // Lower amplitude
        this.consecutiveNormalBeats >= 2; // Only after we've seen some normal beats
      
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
    
    // Only register as a new arrhythmia if it's been at least 1 second since the last one
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 1000) {
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
