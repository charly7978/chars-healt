/**
 * New improved arrhythmia detection module that analyzes heart rhythm patterns
 * using RR intervals and amplitude data to detect irregularities.
 */

type ArrhythmiaResult = {
  detected: boolean;
  severity: number;  // 0-10 scale where 0 is no arrhythmia, 10 is severe
  confidence: number; // 0-1 scale
  type: ArrhythmiaType;
  rmssd?: number;    // Root Mean Square of Successive Differences (variability measure)
  rrVariation?: number; // Variation coefficient of RR intervals
  timestamp: number;
};

type ArrhythmiaType = 'NONE' | 'PAC' | 'PVC' | 'AF' | 'UNKNOWN';

export class ArrhythmiaDetector {
  private rrBuffer: number[] = [];
  private amplitudeBuffer: number[] = [];
  private detectionHistory: ArrhythmiaResult[] = [];
  private learningPhaseDuration = 10000; // 10 seconds of learning phase
  private startTime: number;
  private lastDetectionTime: number = 0;
  
  // Constants for detection algorithms
  private readonly MAX_BUFFER_SIZE = 30;
  private readonly RR_VARIATION_THRESHOLD = 0.20; // 20% variation threshold for suspicious beats
  private readonly AMPLITUDE_VARIATION_THRESHOLD = 0.30; // 30% amplitude variation for PVCs
  private readonly MIN_DETECTION_INTERVAL = 2000; // Min 2 seconds between detections to avoid false positives
  private readonly MIN_RR_INTERVALS = 6; // Minimum intervals needed for reliable detection
  private readonly SEVERE_RMSSD_THRESHOLD = 50; // Threshold for severe arrhythmia (ms)

  constructor() {
    this.startTime = Date.now();
    console.log("New ArrhythmiaDetector initialized");
  }

  /**
   * Process heart beat data to detect arrhythmias
   * @param rrInterval Current RR interval in ms
   * @param amplitude Current beat amplitude (optional)
   * @returns ArrhythmiaResult with detection data
   */
  public processHeartbeat(rrInterval: number, amplitude?: number): ArrhythmiaResult {
    const now = Date.now();
    
    // Add new data to buffers
    if (rrInterval > 0) {
      this.rrBuffer.push(rrInterval);
      
      // Maintain buffer size
      if (this.rrBuffer.length > this.MAX_BUFFER_SIZE) {
        this.rrBuffer.shift();
      }
    }
    
    if (amplitude !== undefined && amplitude > 0) {
      this.amplitudeBuffer.push(amplitude);
      
      // Maintain amplitude buffer size
      if (this.amplitudeBuffer.length > this.MAX_BUFFER_SIZE) {
        this.amplitudeBuffer.shift();
      }
    }
    
    // Default result (no arrhythmia)
    const result: ArrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: 'NONE',
      timestamp: now
    };
    
    // Skip detection during learning phase or if we don't have enough data
    if (this.isInLearningPhase() || this.rrBuffer.length < this.MIN_RR_INTERVALS) {
      return result;
    }
    
    // Calculate key metrics for detection
    const metrics = this.calculateMetrics();
    
    // Detect arrhythmias based on metrics
    const detection = this.detectArrhythmia(metrics);
    
    // Only allow a new detection after MIN_DETECTION_INTERVAL has passed
    if (detection.detected && (now - this.lastDetectionTime) >= this.MIN_DETECTION_INTERVAL) {
      this.lastDetectionTime = now;
      this.detectionHistory.push(detection);
      
      // Keep only the last 10 detections
      if (this.detectionHistory.length > 10) {
        this.detectionHistory.shift();
      }
      
      console.log("ArrhythmiaDetector: Arrhythmia detected!", {
        type: detection.type,
        severity: detection.severity,
        confidence: detection.confidence,
        rmssd: detection.rmssd,
        rrVariation: detection.rrVariation
      });
      
      return detection;
    }
    
    return result;
  }
  
  /**
   * Process batch RR intervals and amplitudes
   * @param rrIntervals Array of RR intervals
   * @param amplitudes Array of corresponding amplitudes (optional)
   * @returns The latest arrhythmia detection result
   */
  public processRRIntervals(rrIntervals: number[], amplitudes?: number[]): ArrhythmiaResult {
    let latestResult: ArrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: 'NONE',
      timestamp: Date.now()
    };
    
    if (!rrIntervals || rrIntervals.length === 0) {
      return latestResult;
    }
    
    // Add all intervals to the buffer
    rrIntervals.forEach((interval, index) => {
      if (interval > 0) {
        const amp = amplitudes && amplitudes.length > index ? amplitudes[index] : undefined;
        const result = this.processHeartbeat(interval, amp);
        if (result.detected) {
          latestResult = result;
        }
      }
    });
    
    return latestResult;
  }
  
  /**
   * Calculate metrics used for arrhythmia detection
   */
  private calculateMetrics() {
    // Calculate average RR interval
    const avgRR = this.rrBuffer.reduce((sum, val) => sum + val, 0) / this.rrBuffer.length;
    
    // Calculate RR variation (coefficient of variation)
    const rrVariation = this.calculateRRVariation(avgRR);
    
    // Calculate RMSSD (Root Mean Square of Successive Differences) - key HRV metric
    const rmssd = this.calculateRMSSD();
    
    // Calculate amplitude variation if we have amplitude data
    const amplitudeVariation = this.calculateAmplitudeVariation();
    
    // Calculate last-to-average ratio (to detect premature beats)
    const lastRR = this.rrBuffer[this.rrBuffer.length - 1];
    const lastToAvgRatio = lastRR / avgRR;
    
    // Detect outlier RR intervals
    const outliers = this.detectOutliers();
    
    return {
      avgRR,
      rrVariation,
      rmssd,
      amplitudeVariation,
      lastToAvgRatio,
      outlierCount: outliers.length,
      outlierRatios: outliers
    };
  }
  
  /**
   * Calculate the variation coefficient of RR intervals
   */
  private calculateRRVariation(avgRR: number): number {
    if (this.rrBuffer.length < 3 || avgRR === 0) return 0;
    
    const sumSquaredDiff = this.rrBuffer.reduce((sum, rr) => {
      const diff = rr - avgRR;
      return sum + (diff * diff);
    }, 0);
    
    const stdDev = Math.sqrt(sumSquaredDiff / this.rrBuffer.length);
    return stdDev / avgRR; // Coefficient of variation
  }
  
  /**
   * Calculate RMSSD (Root Mean Square of Successive Differences)
   * A key HRV metric sensitive to short-term variability
   */
  private calculateRMSSD(): number {
    if (this.rrBuffer.length < 2) return 0;
    
    let sumSquaredDiffs = 0;
    for (let i = 1; i < this.rrBuffer.length; i++) {
      const diff = this.rrBuffer[i] - this.rrBuffer[i-1];
      sumSquaredDiffs += diff * diff;
    }
    
    return Math.sqrt(sumSquaredDiffs / (this.rrBuffer.length - 1));
  }
  
  /**
   * Calculate amplitude variation for PVC detection
   */
  private calculateAmplitudeVariation(): number {
    if (this.amplitudeBuffer.length < 3) return 0;
    
    const avgAmplitude = this.amplitudeBuffer.reduce((sum, val) => sum + val, 0) / 
      this.amplitudeBuffer.length;
    
    const sumSquaredDiff = this.amplitudeBuffer.reduce((sum, amp) => {
      const diff = amp - avgAmplitude;
      return sum + (diff * diff);
    }, 0);
    
    const stdDev = Math.sqrt(sumSquaredDiff / this.amplitudeBuffer.length);
    return stdDev / avgAmplitude; // Coefficient of variation for amplitude
  }
  
  /**
   * Detect outlier RR intervals (potential arrhythmias)
   */
  private detectOutliers(): number[] {
    if (this.rrBuffer.length < 4) return [];
    
    const avgRR = this.rrBuffer.reduce((sum, val) => sum + val, 0) / this.rrBuffer.length;
    const outlierRatios: number[] = [];
    
    for (let i = 0; i < this.rrBuffer.length; i++) {
      const ratio = this.rrBuffer[i] / avgRR;
      
      // Consider as outlier if >30% shorter or >50% longer than average
      if (ratio < 0.7 || ratio > 1.5) {
        outlierRatios.push(ratio);
      }
    }
    
    return outlierRatios;
  }
  
  /**
   * Main arrhythmia detection algorithm based on calculated metrics
   */
  private detectArrhythmia(metrics: any): ArrhythmiaResult {
    const {
      avgRR, 
      rrVariation, 
      rmssd, 
      amplitudeVariation, 
      lastToAvgRatio,
      outlierCount,
      outlierRatios
    } = metrics;
    
    // Initialize result
    const result: ArrhythmiaResult = {
      detected: false,
      severity: 0,
      confidence: 0,
      type: 'NONE',
      timestamp: Date.now(),
      rmssd,
      rrVariation
    };
    
    // Detect Atrial Fibrillation - characterized by high RMSSD and RR variation
    if (rrVariation > 0.18 && rmssd > 40) {
      result.detected = true;
      result.type = 'AF';
      result.severity = Math.min(Math.floor(rrVariation * 30), 10);
      result.confidence = Math.min(rrVariation * 3, 1);
    }
    // Detect Premature Ventricular Contractions (PVCs) 
    // PVCs show early beats (short RR) followed by compensatory pause (long RR)
    // And often have different amplitude
    else if (outlierCount >= 2 && 
            (outlierRatios.some(r => r < 0.7) && outlierRatios.some(r => r > 1.3)) &&
            amplitudeVariation > this.AMPLITUDE_VARIATION_THRESHOLD) {
      result.detected = true;
      result.type = 'PVC';
      result.severity = Math.min(Math.floor(outlierCount * 2), 10);
      result.confidence = Math.min(0.5 + (amplitudeVariation * 0.5), 1);
    }
    // Detect Premature Atrial Contractions (PACs)
    // PACs show early beats but usually without the amplitude changes of PVCs
    else if (outlierCount >= 1 && 
             outlierRatios.some(r => r < 0.7) && 
             amplitudeVariation < this.AMPLITUDE_VARIATION_THRESHOLD) {
      result.detected = true;
      result.type = 'PAC';
      result.severity = Math.min(Math.floor(outlierCount * 1.5), 10);
      result.confidence = Math.min(0.4 + (rrVariation * 0.6), 0.9); // PACs are harder to confirm
    }
    // Catch other arrhythmias based on general irregularity
    else if (rrVariation > this.RR_VARIATION_THRESHOLD) {
      result.detected = true;
      result.type = 'UNKNOWN';
      result.severity = Math.min(Math.floor(rrVariation * 20), 10);
      result.confidence = Math.min(rrVariation * 2, 0.8);
    }
    
    return result;
  }
  
  /**
   * Check if we're still in the learning phase
   */
  public isInLearningPhase(): boolean {
    return (Date.now() - this.startTime) < this.learningPhaseDuration;
  }
  
  /**
   * Get the count of detected arrhythmias
   */
  public getArrhythmiaCount(): number {
    return this.detectionHistory.length;
  }
  
  /**
   * Get the most recently detected arrhythmia
   */
  public getLastArrhythmia(): ArrhythmiaResult | null {
    if (this.detectionHistory.length === 0) return null;
    return this.detectionHistory[this.detectionHistory.length - 1];
  }
  
  /**
   * Generate status text for display
   * @returns String describing the arrhythmia status
   */
  public getStatusText(): string {
    if (this.isInLearningPhase()) {
      return "CALIBRANDO";
    }
    
    const count = this.getArrhythmiaCount();
    
    if (count === 0) {
      return "LATIDO NORMAL";
    }
    
    const lastArrhythmia = this.getLastArrhythmia();
    if (!lastArrhythmia) return "LATIDO NORMAL";
    
    // If a recent detection occurred (within 5 seconds)
    if ((Date.now() - lastArrhythmia.timestamp) < 5000) {
      return `ARRITMIA DETECTADA|${count}`;
    }
    
    // If we have detections but none recent
    return `LATIDO IRREGULAR|${count}`;
  }
  
  /**
   * Reset the detector state
   */
  public reset(): void {
    this.rrBuffer = [];
    this.amplitudeBuffer = [];
    this.detectionHistory = [];
    this.startTime = Date.now();
    this.lastDetectionTime = 0;
    console.log("ArrhythmiaDetector: Reset completed");
  }
}
