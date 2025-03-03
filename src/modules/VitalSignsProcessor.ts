
// This file doesn't exist in the provided code, but we need to update it to include glucose processing
// Creating a minimal version based on references in other files

import { GlucoseEstimator } from './GlucoseEstimator';
import { BloodGlucoseData } from '../types/signal';

export class VitalSignsProcessor {
  private bpmHistory: number[] = [];
  private spo2History: number[] = [];
  private glucoseEstimator: GlucoseEstimator;
  private isFingerDetected = false;

  constructor() {
    this.glucoseEstimator = new GlucoseEstimator();
  }

  smoothBPM(rawBPM: number): number {
    this.bpmHistory.push(rawBPM);
    if (this.bpmHistory.length > 5) {
      this.bpmHistory.shift();
    }

    // Simple moving average for smoothing
    return Math.round(this.bpmHistory.reduce((a, b) => a + b, 0) / this.bpmHistory.length);
  }

  processSignal(
    value: number, 
    rrData?: { 
      intervals: number[], 
      lastPeakTime: number | null, 
      amplitudes?: number[] 
    }
  ) {
    // Calculate if finger is detected
    this.isFingerDetected = Math.abs(value) > 0.5;
    
    // Process blood glucose estimation directly from PPG signal
    this.glucoseEstimator.processPpg(value, this.isFingerDetected);
    
    if (rrData?.intervals && rrData.intervals.length > 0) {
      const avgInterval = rrData.intervals.reduce((sum, val) => sum + val, 0) / rrData.intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      this.glucoseEstimator.updateHeartRate(bpm);
      
      // If we have RR intervals, we can calculate HRV
      if (rrData.intervals.length >= 3) {
        const rmssd = this.calculateRMSSD(rrData.intervals);
        this.glucoseEstimator.updateHrv(rmssd);
      }
    }
    
    // Simplified SpO2 calculation
    let spo2 = 0;
    if (this.isFingerDetected && Math.abs(value) > 1.0) {
      spo2 = 95 + Math.min(4, Math.max(-4, value / 5));
      spo2 = Math.min(100, Math.max(80, Math.round(spo2)));
      
      this.spo2History.push(spo2);
      if (this.spo2History.length > 10) {
        this.spo2History.shift();
      }
      
      spo2 = Math.round(this.spo2History.reduce((a, b) => a + b, 0) / this.spo2History.length);
      this.glucoseEstimator.updateSpo2(spo2);
    }
    
    // Get blood glucose estimate if enough data is available
    let glucose: BloodGlucoseData | null = null;
    if (this.glucoseEstimator.hasValidGlucoseData()) {
      glucose = this.glucoseEstimator.estimateGlucose();
    }
    
    // Simplified blood pressure calculation based on heart rate and signal strength
    let pressure = "--/--";
    if (rrData?.intervals && rrData.intervals.length > 0 && this.isFingerDetected) {
      const avgInterval = rrData.intervals.reduce((sum, val) => sum + val, 0) / rrData.intervals.length;
      const hr = Math.round(60000 / avgInterval);
      
      // Very simplified BP model based on heart rate
      if (hr > 0) {
        const systolic = Math.round(100 + (hr - 70) * 0.7 + value * 5);
        const diastolic = Math.round(70 + (hr - 70) * 0.4 + value * 3);
        pressure = `${systolic}/${diastolic}`;
      }
    }
    
    return {
      spo2,
      pressure,
      glucose
    };
  }
  
  private calculateRMSSD(intervals: number[]): number {
    if (intervals.length < 2) return 0;
    
    let sumSquaredDiffs = 0;
    for (let i = 0; i < intervals.length - 1; i++) {
      const diff = intervals[i + 1] - intervals[i];
      sumSquaredDiffs += diff * diff;
    }
    
    return Math.sqrt(sumSquaredDiffs / (intervals.length - 1));
  }
  
  reset(): void {
    this.bpmHistory = [];
    this.spo2History = [];
    this.glucoseEstimator.reset();
    this.isFingerDetected = false;
  }
}
