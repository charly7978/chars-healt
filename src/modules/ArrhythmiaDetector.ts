
/**
 * ArrhythmiaDetector.ts - Focused Premature Beat Detector
 * 
 * Simplified detector that focuses exclusively on premature beat detection
 * with ULTRA HIGH SENSITIVITY for testing purposes
 */

export class ArrhythmiaDetector {
  private arrhythmiaCount = 0;
  private hasDetectedArrhythmia = false;
  private lastArrhythmiaTime: number = 0;
  private rrIntervals: number[] = [];
  private peakAmplitudes: number[] = [];
  private lastPeakTime: number | null = null;
  private baseRRInterval: number = 0;
  private readonly LEARNING_SAMPLES = 6; // Reduced from 12 to be more responsive
  private readonly PREMATURE_BEAT_THRESHOLD = 0.9; // Increased from 0.75 to be ultra-sensitive
  private readonly MIN_DETECTION_CONFIDENCE = 0.3; // Lowered from 0.65 to be ultra-sensitive

  constructor() {
    this.reset();
  }

  /**
   * Reset all detector state variables
   */
  reset(): void {
    this.rrIntervals = [];
    this.peakAmplitudes = [];
    this.hasDetectedArrhythmia = false;
    this.arrhythmiaCount = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.baseRRInterval = 0;
    console.log("ArrhythmiaDetector: Reset completo");
  }

  /**
   * Check if detector is still in learning phase
   */
  isInLearningPhase(): boolean {
    return this.rrIntervals.length < this.LEARNING_SAMPLES || this.baseRRInterval === 0;
  }

  /**
   * Update detector with new RR intervals and peak amplitude data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Update RR intervals
    if (intervals && intervals.length > 0) {
      this.rrIntervals = intervals.slice(-20); // Keep only the last 20 intervals (reduced from 30)
    }
    
    this.lastPeakTime = lastPeakTime;
    
    // Store peak amplitude if provided
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.peakAmplitudes.push(peakAmplitude);
      
      // Keep same number of amplitudes as intervals
      if (this.peakAmplitudes.length > this.rrIntervals.length) {
        this.peakAmplitudes = this.peakAmplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    // Calculate baseline RR interval after collecting enough samples
    if (this.rrIntervals.length >= this.LEARNING_SAMPLES && this.baseRRInterval === 0) {
      this.calculateBaseRRInterval();
    } else if (this.rrIntervals.length >= this.LEARNING_SAMPLES) {
      // Continuously update baseline for better reactivity (new ultra-sensitive feature)
      this.updateBaseRRInterval();
    }
  }

  /**
   * Calculate baseline RR interval from collected samples
   */
  private calculateBaseRRInterval(): void {
    if (this.rrIntervals.length < this.LEARNING_SAMPLES) return;
    
    // Use simple average for initial calculation to be more responsive
    const sum = this.rrIntervals.reduce((a, b) => a + b, 0);
    this.baseRRInterval = sum / this.rrIntervals.length;
    
    console.log(`ArrhythmiaDetector: Baseline RR interval calculated: ${this.baseRRInterval}ms`);
  }

  /**
   * Update baseline RR interval continuously for better adaptivity
   * New ultra-sensitive feature
   */
  private updateBaseRRInterval(): void {
    // Get more recent intervals
    const recentIntervals = this.rrIntervals.slice(-5);
    
    // Filter out potential premature beats (much shorter intervals)
    const normalIntervals = recentIntervals.filter(interval => 
      interval > (this.baseRRInterval * 0.7)
    );
    
    if (normalIntervals.length >= 3) {
      // Update baseline with a weighted average
      const sum = normalIntervals.reduce((a, b) => a + b, 0);
      const newBaseRR = sum / normalIntervals.length;
      
      // Weighted update (80% old value, 20% new value) to prevent too rapid changes
      this.baseRRInterval = (this.baseRRInterval * 0.8) + (newBaseRR * 0.2);
    }
  }

  /**
   * Ultra-sensitive premature beat detection algorithm
   * Deliberately over-sensitive for testing purposes
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // Skip detection if not enough data
    if (this.rrIntervals.length < 2) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Get last intervals for analysis - using just the last 2 for ultra-quick response
    const recentIntervals = this.rrIntervals.slice(-2);
    const lastRR = recentIntervals[recentIntervals.length - 1];
    
    // Calculate RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / Math.max(1, recentIntervals.length - 1));
    
    // Calculate RR variation for analysis
    const rrVariation = (this.baseRRInterval > 0) ? 
      Math.abs(lastRR - this.baseRRInterval) / this.baseRRInterval : 
      0;
    
    // Ultra-sensitive premature beat detection
    let prematureBeat = false;
    let confidenceScore = 0;
    let detectedArrhythmia = false;
    
    // ULTRA-SENSITIVE DETECTION LOGIC:
    // Consider ANY interval significantly different from baseline as suspicious
    
    // 1. Check for premature beats - any shorter interval triggers detection
    if (this.baseRRInterval > 0 && lastRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD) {
      // Calculate confidence based on how much shorter the interval is
      const shortness = (this.baseRRInterval - lastRR) / this.baseRRInterval;
      
      // Ultra-sensitive confidence calculation - multiplied by 2 and capped
      confidenceScore = Math.min(shortness * 2, 0.99);
      
      if (confidenceScore > this.MIN_DETECTION_CONFIDENCE) {
        prematureBeat = true;
        detectedArrhythmia = true;
        console.log("ULTRA-SENSITIVE ARRITMIA DETECTADA:", { 
          lastRR, 
          baseRR: this.baseRRInterval, 
          confidence: confidenceScore 
        });
      }
    }
    
    // 2. Also check for sudden RR variations (new ultra-sensitive feature)
    if (!detectedArrhythmia && recentIntervals.length >= 2) {
      const prevRR = recentIntervals[recentIntervals.length - 2];
      const rrChange = Math.abs(lastRR - prevRR) / prevRR;
      
      if (rrChange > 0.15) { // 15% change between consecutive beats
        confidenceScore = Math.min(rrChange * 1.5, 0.99);
        if (confidenceScore > this.MIN_DETECTION_CONFIDENCE) {
          prematureBeat = true;
          detectedArrhythmia = true;
          console.log("ULTRA-SENSITIVE VARIACIÓN RR DETECTADA:", {
            lastRR,
            prevRR,
            change: rrChange,
            confidence: confidenceScore
          });
        }
      }
    }
    
    // Update detection status
    if (detectedArrhythmia) {
      const now = Date.now();
      // Reduced time between arrhythmia counts for ultra-sensitivity
      if (now - this.lastArrhythmiaTime > 500) { // Reduced from 1000ms to 500ms
        this.arrhythmiaCount++;
        this.lastArrhythmiaTime = now;
      }
      this.hasDetectedArrhythmia = true;
    }
    
    return {
      detected: detectedArrhythmia,
      count: this.arrhythmiaCount,
      status: this.hasDetectedArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd, 
        rrVariation, 
        prematureBeat,
        confidence: confidenceScore
      }
    };
  }

  /**
   * Get current arrhythmia status string
   */
  getStatus(): string {
    return this.hasDetectedArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Get current arrhythmia count
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Clean memory function for resource management
   */
  cleanMemory(): void {
    this.reset();
  }
}
