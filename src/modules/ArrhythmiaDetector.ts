
/**
 * ArrhythmiaDetector.ts - Centralized Arrhythmia Detection
 * 
 * Single source of truth for arrhythmia detection with high sensitivity
 */

export class ArrhythmiaDetector {
  private arrhythmiaCount = 0;
  private hasDetectedArrhythmia = false;
  private lastArrhythmiaTime: number = 0;
  private rrIntervals: number[] = [];
  private peakAmplitudes: number[] = [];
  private lastPeakTime: number | null = null;
  private baseRRInterval: number = 0;
  private readonly LEARNING_SAMPLES = 6;
  private readonly PREMATURE_BEAT_THRESHOLD = 0.9;
  private readonly MIN_DETECTION_CONFIDENCE = 0.3;

  constructor() {
    this.reset();
    console.log("ArrhythmiaDetector: Initialized with ultra-high sensitivity");
  }

  reset(): void {
    this.rrIntervals = [];
    this.peakAmplitudes = [];
    this.hasDetectedArrhythmia = false;
    this.arrhythmiaCount = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.baseRRInterval = 0;
    console.log("ArrhythmiaDetector: Complete reset");
  }

  isInLearningPhase(): boolean {
    return this.rrIntervals.length < this.LEARNING_SAMPLES || this.baseRRInterval === 0;
  }

  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    if (intervals && intervals.length > 0) {
      this.rrIntervals = intervals.slice(-20);
      console.log("ArrhythmiaDetector: Updated intervals:", this.rrIntervals.length);
    }
    
    this.lastPeakTime = lastPeakTime;
    
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.peakAmplitudes.push(peakAmplitude);
      if (this.peakAmplitudes.length > this.rrIntervals.length) {
        this.peakAmplitudes = this.peakAmplitudes.slice(-this.rrIntervals.length);
      }
      console.log("ArrhythmiaDetector: Added amplitude:", peakAmplitude);
    }
    
    if (this.rrIntervals.length >= this.LEARNING_SAMPLES) {
      this.updateBaseRRInterval();
    }
  }

  private updateBaseRRInterval(): void {
    const recentIntervals = this.rrIntervals.slice(-5);
    const normalIntervals = recentIntervals.filter(interval => 
      interval > (this.baseRRInterval * 0.7)
    );
    
    if (normalIntervals.length >= 3) {
      const sum = normalIntervals.reduce((a, b) => a + b, 0);
      const newBaseRR = sum / normalIntervals.length;
      this.baseRRInterval = (this.baseRRInterval * 0.8) + (newBaseRR * 0.2);
    }
  }

  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence: number } | null;
  } {
    if (this.rrIntervals.length < 2) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.getStatus(),
        data: null
      };
    }

    const recentIntervals = this.rrIntervals.slice(-2);
    const lastRR = recentIntervals[recentIntervals.length - 1];
    
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / Math.max(1, recentIntervals.length - 1));
    
    const rrVariation = (this.baseRRInterval > 0) ? 
      Math.abs(lastRR - this.baseRRInterval) / this.baseRRInterval : 
      0;
    
    let prematureBeat = false;
    let confidenceScore = 0;
    let detectedArrhythmia = false;
    
    // Ultra-sensitive detection
    if (this.baseRRInterval > 0 && lastRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD) {
      const shortness = (this.baseRRInterval - lastRR) / this.baseRRInterval;
      confidenceScore = Math.min(shortness * 2, 0.99);
      
      if (confidenceScore > this.MIN_DETECTION_CONFIDENCE) {
        prematureBeat = true;
        detectedArrhythmia = true;
        console.log("ArrhythmiaDetector: Detected premature beat!", {
          lastRR,
          baseRR: this.baseRRInterval,
          confidence: confidenceScore
        });
      }
    }
    
    // Check RR variations
    if (!detectedArrhythmia && recentIntervals.length >= 2) {
      const prevRR = recentIntervals[recentIntervals.length - 2];
      const rrChange = Math.abs(lastRR - prevRR) / prevRR;
      
      if (rrChange > 0.15) {
        confidenceScore = Math.min(rrChange * 1.5, 0.99);
        if (confidenceScore > this.MIN_DETECTION_CONFIDENCE) {
          prematureBeat = true;
          detectedArrhythmia = true;
          console.log("ArrhythmiaDetector: Detected RR variation!", {
            lastRR,
            prevRR,
            change: rrChange,
            confidence: confidenceScore
          });
        }
      }
    }
    
    if (detectedArrhythmia) {
      const now = Date.now();
      if (now - this.lastArrhythmiaTime > 500) {
        this.arrhythmiaCount++;
        this.lastArrhythmiaTime = now;
      }
      this.hasDetectedArrhythmia = true;
    }
    
    return {
      detected: detectedArrhythmia,
      count: this.arrhythmiaCount,
      status: this.getStatus(),
      data: {
        rmssd,
        rrVariation,
        prematureBeat,
        confidence: confidenceScore
      }
    };
  }

  getStatus(): string {
    return this.hasDetectedArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  cleanMemory(): void {
    this.reset();
  }
}
