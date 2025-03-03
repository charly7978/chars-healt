/**
 * ArrhythmiaDetector.ts - Focused Premature Beat Detector
 * 
 * Simplified detector that focuses exclusively on premature beat detection
 */

export class ArrhythmiaDetector {
  private arrhythmiaCount = 0;
  private hasDetectedArrhythmia = false;
  private lastArrhythmiaTime: number = 0;
  private rrIntervals: number[] = [];
  private peakAmplitudes: number[] = [];
  private lastPeakTime: number | null = null;
  private baseRRInterval: number = 0;
  private readonly LEARNING_SAMPLES = 12;
  private readonly PREMATURE_BEAT_THRESHOLD = 0.75; // Factor para detectar latidos prematuros
  private readonly MIN_DETECTION_CONFIDENCE = 0.65; // Confianza mínima para detección

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
   * Update detector with new RR intervals and peak amplitude data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Update RR intervals
    if (intervals && intervals.length > 0) {
      this.rrIntervals = intervals.slice(-30); // Keep only the last 30 intervals
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
    }
  }

  /**
   * Calculate baseline RR interval from collected samples
   */
  private calculateBaseRRInterval(): void {
    if (this.rrIntervals.length < this.LEARNING_SAMPLES) return;
    
    // Sort intervals and remove outliers (10% from each end)
    const sorted = [...this.rrIntervals].sort((a, b) => a - b);
    const cutSize = Math.max(1, Math.floor(sorted.length * 0.1));
    const filtered = sorted.slice(cutSize, sorted.length - cutSize);
    
    // Use median as baseline
    const medianIndex = Math.floor(filtered.length / 2);
    this.baseRRInterval = filtered[medianIndex];
    
    console.log(`ArrhythmiaDetector: Baseline RR interval calculated: ${this.baseRRInterval}ms`);
  }

  /**
   * Advanced premature beat detection algorithm
   * Focused exclusively on identifying premature heartbeats
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // Skip detection if not enough data or no baseline established
    if (this.rrIntervals.length < 3 || this.baseRRInterval <= 0) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Get last few intervals for analysis
    const recentIntervals = this.rrIntervals.slice(-3);
    const lastRR = recentIntervals[recentIntervals.length - 1];
    
    // Calculate RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentIntervals.length - 1));
    
    // Calculate RR variation for analysis
    const rrVariation = (this.baseRRInterval > 0) ? 
      Math.abs(lastRR - this.baseRRInterval) / this.baseRRInterval : 
      0;
    
    // Specialized premature beat detection algorithm
    let prematureBeat = false;
    let confidenceScore = 0;
    let detectedArrhythmia = false;
    
    // Core premature beat detection logic:
    // 1. Significantly shorter RR interval than baseline
    if (lastRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD) {
      // Calculate confidence based on how much shorter the interval is
      const shortness = (this.baseRRInterval - lastRR) / this.baseRRInterval;
      confidenceScore = Math.min(shortness * 1.2, 0.95);
      
      if (confidenceScore > this.MIN_DETECTION_CONFIDENCE) {
        prematureBeat = true;
        detectedArrhythmia = true;
      }
    }
    
    // Update detection status
    if (detectedArrhythmia) {
      const now = Date.now();
      // Prevent multiple counts in short time
      if (now - this.lastArrhythmiaTime > 1000) {
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
