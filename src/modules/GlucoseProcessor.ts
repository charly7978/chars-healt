import { enhancedPeakDetection } from '../utils/signalProcessingUtils';

interface GlucoseData {
  value: number;
  trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  confidence: number;
  timeOffset: number;
  lastCalibration?: number;
}

export class GlucoseProcessor {
  private readonly WINDOW_SIZE = 300;
  private ppgBuffer: number[] = [];
  private glucoseHistory: number[] = [];
  private lastGlucoseValue: number = 100;
  private calibrationTimestamp: number = Date.now();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.ppgBuffer = [];
    this.glucoseHistory = [];
    this.lastGlucoseValue = 100;
    this.calibrationTimestamp = Date.now();
  }

  processSignal(ppgValue: number): GlucoseData {
    this.ppgBuffer.push(ppgValue);
    if (this.ppgBuffer.length > this.WINDOW_SIZE) {
      this.ppgBuffer.shift();
    }

    const glucoseValue = this.calculateGlucoseFromPPG();
    this.glucoseHistory.push(glucoseValue);
    if (this.glucoseHistory.length > 10) {
      this.glucoseHistory.shift();
    }

    const trend = this.calculateTrend();
    const confidence = this.calculateConfidence();

    this.lastGlucoseValue = glucoseValue;

    return {
      value: glucoseValue,
      trend,
      confidence,
      timeOffset: (Date.now() - this.calibrationTimestamp) / 60000,
      lastCalibration: this.calibrationTimestamp
    };
  }

  private calculateGlucoseFromPPG(): number {
    const peaks = enhancedPeakDetection(this.ppgBuffer);
    const amplitude = peaks.peakIndices.length > 0 ? peaks.peakIndices.length : 1;
    const glucoseEstimate = 80 + amplitude * 0.5;

    return Math.round(glucoseEstimate);
  }

  private calculateTrend(): GlucoseData['trend'] {
    if (this.glucoseHistory.length < 3) return 'unknown';

    const recentValues = this.glucoseHistory.slice(-3);
    const diff = recentValues[2] - recentValues[0];

    if (Math.abs(diff) < 5) return 'stable';
    if (diff >= 15) return 'rising_rapidly';
    if (diff <= -15) return 'falling_rapidly';
    if (diff > 0) return 'rising';
    return 'falling';
  }

  private calculateConfidence(): number {
    const variability = Math.max(...this.glucoseHistory) - Math.min(...this.glucoseHistory);
    return Math.max(50, 100 - variability);
  }
} 