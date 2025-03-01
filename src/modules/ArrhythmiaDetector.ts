export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly RMSSD_THRESHOLD = 70;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 5000;

  // State variables
  private rrIntervals: number[] = [];
  private isLearningPhase = true;
  private hasDetectedFirstArrhythmia = false;
  private arrhythmiaDetected = false;
  private measurementStartTime: number = Date.now();
  private arrhythmiaCount = 0;
  private lastRMSSD: number = 0;
  private lastRRVariation: number = 0;
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;

  /**
   * Reset all state variables
   */
  reset(): void {
    this.rrIntervals = [];
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
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
      }
    }
  }

  /**
   * Update RR intervals with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null): void {
    this.rrIntervals = intervals;
    this.lastPeakTime = lastPeakTime;
    this.updateLearningPhase();
  }

  /**
   * Detect arrhythmia based on current RR intervals
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number } | null;
  } {
    if (this.rrIntervals.length < this.RR_WINDOW_SIZE || this.isLearningPhase) {
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
    const recentRR = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    
    // Calculate RMSSD
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i-1];
      sumSquaredDiff += diff * diff;
    }
    
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const lastRR = recentRR[recentRR.length - 1];
    const rrVariation = Math.abs(lastRR - avgRR) / avgRR;
    
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
    
    // Detect arrhythmia based on thresholds
    const newArrhythmiaState = rmssd > this.RMSSD_THRESHOLD && 
                              rrVariation > 0.55 &&
                              this.rrIntervals.length >= 10;
    
    // If it's a new arrhythmia and enough time has passed since the last one
    if (newArrhythmiaState && 
        currentTime - this.lastArrhythmiaTime > 1000) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      
      // Mark that we've detected the first arrhythmia
      this.hasDetectedFirstArrhythmia = true;
      
      console.log('ArrhythmiaDetector - New arrhythmia detected:', {
        count: this.arrhythmiaCount,
        rmssd,
        rrVariation,
        timestamp: currentTime
      });
    }

    this.arrhythmiaDetected = newArrhythmiaState;

    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: this.arrhythmiaDetected ? { rmssd, rrVariation } : null
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
