export class VitalSignsProcessor {
  private readonly SPO2_ALPHA = 0.3;
  private readonly BPM_ALPHA = 0.1;
  private readonly QUALITY_ALPHA = 0.2;
  private readonly MIN_QUALITY_THRESHOLD = 40;
  private readonly CALIBRATION_SAMPLES = 100;
  private readonly ARRHYTHMIA_WINDOW = 10;
  private readonly RR_VARIATION_THRESHOLD = 0.2;
  private readonly RMSSD_THRESHOLD = 50;

  private lastPeak: number = 0;
  private peakCount: number = 0;
  private valleys: number[] = [];
  private peaks: number[] = [];
  private rrIntervals: number[] = [];
  private lastRrInterval: number = 0;
  private calibrationCount: number = 0;
  private baselineValue: number = 0;
  private lastBpm: number = 0;
  private lastSpo2: number = 0;
  private lastQuality: number = 0;
  private isCalibrated: boolean = false;
  private arrhythmiaCount: number = 0;
  private lastArrhythmiaCheck: number = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.lastPeak = 0;
    this.peakCount = 0;
    this.valleys = [];
    this.peaks = [];
    this.rrIntervals = [];
    this.lastRrInterval = 0;
    this.calibrationCount = 0;
    this.baselineValue = 0;
    this.lastBpm = 0;
    this.lastSpo2 = 0;
    this.lastQuality = 0;
    this.isCalibrated = false;
    this.arrhythmiaCount = 0;
    this.lastArrhythmiaCheck = 0;
  }

  private calculateRMSSD(intervals: number[]): number {
    if (intervals.length < 2) return 0;
    
    let sumSquaredDiffs = 0;
    for (let i = 1; i < intervals.length; i++) {
      const diff = intervals[i] - intervals[i-1];
      sumSquaredDiffs += diff * diff;
    }
    
    return Math.sqrt(sumSquaredDiffs / (intervals.length - 1));
  }

  private detectArrhythmia(timestamp: number): {
    status: string;
    count: number;
    data?: {
      timestamp: number;
      rmssd: number;
      rrVariation: number;
    };
  } {
    if (!this.isCalibrated) {
      return { status: "CALIBRANDO...", count: 0 };
    }

    if (this.rrIntervals.length < this.ARRHYTHMIA_WINDOW) {
      return { status: "SIN ARRITMIA", count: 0 };
    }

    const recentIntervals = this.rrIntervals.slice(-this.ARRHYTHMIA_WINDOW);
    const rmssd = this.calculateRMSSD(recentIntervals);
    
    const mean = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const rrVariation = recentIntervals.some(interval => 
      Math.abs(interval - mean) / mean > this.RR_VARIATION_THRESHOLD
    );

    const hasArrhythmia = rmssd > this.RMSSD_THRESHOLD && rrVariation;

    if (hasArrhythmia) {
      this.arrhythmiaCount++;
      return {
        status: "ARRITMIA DETECTADA",
        count: this.arrhythmiaCount,
        data: {
          timestamp,
          rmssd,
          rrVariation: Math.max(...recentIntervals) - Math.min(...recentIntervals)
        }
      };
    }

    return { status: "SIN ARRITMIA", count: 0 };
  }

  // Add explicit type for process signal method
  public processSignal(value: number): {
    bpm: number;
    spo2: number;
    quality: number;
    arrhythmia: {
      status: string;
      count: number;
      data?: {
        timestamp: number;
        rmssd: number;
        rrVariation: number;
      };
    };
  } {
    if (this.calibrationCount < this.CALIBRATION_SAMPLES) {
      this.baselineValue = (this.baselineValue * this.calibrationCount + value) / (this.calibrationCount + 1);
      this.calibrationCount++;
      return {
        bpm: 0,
        spo2: 0,
        quality: 0,
        arrhythmia: { status: "CALIBRANDO...", count: 0 }
      };
    }

    this.isCalibrated = true;
    const normalizedValue = value - this.baselineValue;

    // Detectar picos
    if (normalizedValue > 0 && this.lastPeak <= 0) {
      const timeSinceLastPeak = timestamp - this.lastArrhythmiaCheck;
      if (timeSinceLastPeak > 500) { // Evitar detecciones falsas
        this.peakCount++;
        this.peaks.push(timestamp);
        
        if (this.peaks.length > 1) {
          const interval = this.peaks[this.peaks.length - 1] - this.peaks[this.peaks.length - 2];
          this.rrIntervals.push(interval);
          this.lastRrInterval = interval;
          
          // Mantener solo los últimos 10 intervalos
          if (this.rrIntervals.length > this.ARRHYTHMIA_WINDOW) {
            this.rrIntervals.shift();
          }
        }
      }
      this.lastArrhythmiaCheck = timestamp;
    }
    this.lastPeak = normalizedValue;

    // Calcular BPM
    if (this.peaks.length >= 2) {
      const timeSpan = this.peaks[this.peaks.length - 1] - this.peaks[0];
      const instantBpm = (this.peaks.length - 1) * 60000 / timeSpan;
      this.lastBpm = this.lastBpm * (1 - this.BPM_ALPHA) + instantBpm * this.BPM_ALPHA;
    }

    // Simular SpO2 (en una implementación real, esto vendría de un sensor)
    const simulatedSpo2 = 95 + Math.random() * 3;
    this.lastSpo2 = this.lastSpo2 * (1 - this.SPO2_ALPHA) + simulatedSpo2 * this.SPO2_ALPHA;

    // Calcular calidad de señal
    const quality = Math.min(100, Math.max(0, 100 * (1 - Math.abs(normalizedValue) / 100)));
    this.lastQuality = this.lastQuality * (1 - this.QUALITY_ALPHA) + quality * this.QUALITY_ALPHA;

    // Limpiar picos antiguos
    const oldestValidTime = timestamp - 10000; // 10 segundos
    this.peaks = this.peaks.filter(p => p > oldestValidTime);

    return {
      bpm: Math.round(this.lastBpm),
      spo2: Math.round(this.lastSpo2),
      quality: Math.round(this.lastQuality),
      arrhythmia: this.detectArrhythmia(timestamp)
    };
  }
}
