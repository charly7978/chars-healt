export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  
  // New constants for premature beat detection
  private readonly PREMATURE_BEAT_THRESHOLD = 0.70; // A premature beat is typically 70% or less of the preceding normal beat
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.60; // Amplitude ratio for PVC detection
  private readonly POST_PREMATURE_THRESHOLD = 1.20; // Post-premature beat is typically longer
  
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
          // Use median to avoid outliers affecting the baseline
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          this.baseRRInterval = sortedRR[Math.floor(sortedRR.length / 2)];
          
          // Calculate average normal amplitude (top 70% of amplitudes are likely normal beats)
          if (this.amplitudes.length > 5) {
            const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a); // Sort descending
            const normalBeatsCount = Math.ceil(sortedAmplitudes.length * 0.7);
            const normalAmplitudes = sortedAmplitudes.slice(0, normalBeatsCount);
            this.avgNormalAmplitude = normalAmplitudes.reduce((a, b) => a + b, 0) / normalAmplitudes.length;
            
            console.log('ArrhythmiaDetector - Baseline values calculated:', {
              baseRRInterval: this.baseRRInterval,
              avgNormalAmplitude: this.avgNormalAmplitude
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
    
    // Get the last 3 RR intervals for pattern analysis
    const lastRRs = this.rrIntervals.slice(-3);
    
    // Get the last 3 amplitudes
    const lastAmplitudes = this.amplitudes.slice(-3);
    
    // Detect premature beat pattern (short interval followed by compensatory pause)
    let prematureBeatDetected = false;
    
    if (lastRRs.length >= 2 && lastAmplitudes.length >= 2) {
      const lastRR = lastRRs[lastRRs.length - 1];
      const previousRR = lastRRs[lastRRs.length - 2];
      
      const lastAmplitude = lastAmplitudes[lastAmplitudes.length - 1];
      const prevAmplitude = lastAmplitudes[lastAmplitudes.length - 2];
      
      // If we have 3 intervals, we can check for the compensatory pause after a premature beat
      if (lastRRs.length >= 3) {
        const prevPrevRR = lastRRs[lastRRs.length - 3];
        
        // Pattern: normal - short - compensatory
        // For example, if normal RR is 800ms, a PVC might show: 800ms - 600ms - 1000ms
        const isPrematurePattern = 
          (previousRR < prevPrevRR * this.PREMATURE_BEAT_THRESHOLD) && // Short RR interval for premature beat
          (lastRR > previousRR * this.POST_PREMATURE_THRESHOLD);       // Followed by compensatory pause
        
        // Check if the amplitude of the premature beat is significantly lower
        const isLowAmplitude = prevAmplitude < this.avgNormalAmplitude * this.AMPLITUDE_RATIO_THRESHOLD;
        
        prematureBeatDetected = isPrematurePattern && isLowAmplitude;
        
        if (prematureBeatDetected) {
          console.log('ArrhythmiaDetector - Premature beat pattern detected:', {
            normalRR: prevPrevRR,
            prematureRR: previousRR,
            compensatoryRR: lastRR,
            normalAmplitude: this.avgNormalAmplitude,
            prematureAmplitude: prevAmplitude,
            ratio: prevAmplitude / this.avgNormalAmplitude
          });
        }
      }
      
      // If we only have 2 intervals, use a simpler metric
      else {
        // If there's a sudden drop in amplitude and a shorter RR interval, it might be a premature beat
        const isLowAmplitude = lastAmplitude < this.avgNormalAmplitude * this.AMPLITUDE_RATIO_THRESHOLD;
        const isShortRR = lastRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD;
        
        prematureBeatDetected = isLowAmplitude && isShortRR;
      }
    }
    
    // Use the premature beat detection as primary, but also keep the RMSSD calculation
    // for potential additional validation or future use
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
