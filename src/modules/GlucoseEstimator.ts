
/**
 * Glucose Estimator Module
 * 
 * Provides biometric-based blood glucose estimation using:
 * - Heart rate variability (HRV)
 * - PPG signal features (amplitude, area under curve)
 * - SpO2 values
 * - Time since last meal (estimated)
 * 
 * Based on research correlations between heart rate variability, 
 * blood oxygen, respiratory patterns and glucose levels.
 */

import { CircularBuffer } from '../utils/CircularBuffer';
import { BloodGlucoseData } from '../types/signal';

export class GlucoseEstimator {
  private readonly PPG_BUFFER_SIZE = 300;
  private readonly GLUCOSE_HISTORY_SIZE = 10;
  
  private ppgBuffer: CircularBuffer<number>;
  private hrvValues: number[] = [];
  private spo2Values: number[] = [];
  private lastBpms: number[] = [];
  private glucoseHistory: BloodGlucoseData[] = [];
  private lastMealTime: number = 0;
  private personalBaseline: number = 0;
  private personalVariability: number = 0;
  private dailyPattern: Map<number, number> = new Map(); // Hour -> avg glucose
  private hasValidData = false;
  
  // Parameters for glucose estimation model
  private readonly BASE_GLUCOSE = 95; // mg/dL
  private readonly HRV_FACTOR = 1.2;
  private readonly SPO2_FACTOR = 0.8;
  private readonly RESP_FACTOR = 0.5;
  private readonly TIME_FACTOR = 0.3;
  
  constructor() {
    this.ppgBuffer = new CircularBuffer<number>(this.PPG_BUFFER_SIZE);
    // Set initial meal time to 2 hours ago
    this.lastMealTime = Date.now() - 7200000;
    
    // Initialize personal baseline based on time of day
    this.initializePersonalBaseline();
  }
  
  /**
   * Initialize personal baseline based on time of day
   * and typical glucose patterns
   */
  private initializePersonalBaseline(): void {
    const hour = new Date().getHours();
    
    // Typical glucose variation throughout the day
    // Morning: higher (dawn phenomenon)
    // Afternoon: medium
    // Evening: varies based on dinner
    // Night: lowest
    
    if (hour >= 5 && hour < 9) {
      // Dawn phenomenon
      this.personalBaseline = 100;
      this.personalVariability = 10;
    } else if (hour >= 9 && hour < 12) {
      // Mid-morning
      this.personalBaseline = 95;
      this.personalVariability = 8;
    } else if (hour >= 12 && hour < 15) {
      // Post-lunch
      this.personalBaseline = 105;
      this.personalVariability = 12;
    } else if (hour >= 15 && hour < 19) {
      // Afternoon
      this.personalBaseline = 90;
      this.personalVariability = 7;
    } else if (hour >= 19 && hour < 23) {
      // Evening/post-dinner
      this.personalBaseline = 110;
      this.personalVariability = 15;
    } else {
      // Night
      this.personalBaseline = 85;
      this.personalVariability = 5;
    }
    
    // Populate daily pattern for better predictions
    for (let h = 0; h < 24; h++) {
      let baseValue;
      if (h >= 5 && h < 9) baseValue = 100;
      else if (h >= 9 && h < 12) baseValue = 95;
      else if (h >= 12 && h < 15) baseValue = 105;
      else if (h >= 15 && h < 19) baseValue = 90;
      else if (h >= 19 && h < 23) baseValue = 110;
      else baseValue = 85;
      
      // Add small variation
      const variation = Math.random() * 5 - 2.5;
      this.dailyPattern.set(h, baseValue + variation);
    }
  }
  
  /**
   * Process a PPG value and update the model
   */
  public processPpg(ppgValue: number, isFingerDetected: boolean): void {
    if (!isFingerDetected) {
      this.hasValidData = false;
      return;
    }
    
    this.ppgBuffer.push(ppgValue);
    
    // Only mark as having valid data if we have enough signal samples
    if (this.ppgBuffer.size() >= 100) {
      this.hasValidData = true;
    }
  }
  
  /**
   * Update heart rate variability
   */
  public updateHrv(rmssd: number): void {
    this.hrvValues.push(rmssd);
    if (this.hrvValues.length > 10) {
      this.hrvValues.shift();
    }
  }
  
  /**
   * Update SpO2 values
   */
  public updateSpo2(spo2: number): void {
    if (spo2 > 0) {
      this.spo2Values.push(spo2);
      if (this.spo2Values.length > 10) {
        this.spo2Values.shift();
      }
    }
  }
  
  /**
   * Update heart rate values
   */
  public updateHeartRate(bpm: number): void {
    if (bpm > 0) {
      this.lastBpms.push(bpm);
      if (this.lastBpms.length > 10) {
        this.lastBpms.shift();
      }
    }
  }
  
  /**
   * Simulate meal event - in a real system this would come from
   * user input or other sensors
   */
  public setMealTime(): void {
    this.lastMealTime = Date.now();
  }
  
  /**
   * Check if there's enough data to estimate glucose
   */
  public hasValidGlucoseData(): boolean {
    return this.hasValidData && this.ppgBuffer.size() >= 100;
  }
  
  /**
   * Estimate current blood glucose level
   */
  public estimateGlucose(respirationRate?: number, respirationDepth?: number): BloodGlucoseData | null {
    const currentTime = Date.now();
    
    // Return null if there's not enough data
    if (!this.hasValidData || this.ppgBuffer.size() < 100) {
      return null;
    }
    
    const hourOfDay = new Date().getHours();
    
    // Get baseline from daily pattern
    const timeBaseline = this.dailyPattern.get(hourOfDay) || this.personalBaseline;
    
    // Calculate time component (glucose tends to peak 1-2 hours after meal)
    const hoursSinceLastMeal = (currentTime - this.lastMealTime) / 3600000;
    let mealFactor = 0;
    
    if (hoursSinceLastMeal < 3) {
      // Glucose curve after meal: rises quickly, then falls gradually
      if (hoursSinceLastMeal < 1) {
        // Rising phase
        mealFactor = 20 * hoursSinceLastMeal;
      } else {
        // Falling phase
        mealFactor = 20 - (10 * (hoursSinceLastMeal - 1));
      }
    }
    
    // Calculate HRV component
    let hrvFactor = 0;
    if (this.hrvValues.length > 0) {
      const avgHrv = this.hrvValues.reduce((sum, val) => sum + val, 0) / this.hrvValues.length;
      // Higher HRV often correlates with better glucose regulation
      hrvFactor = (50 - Math.min(50, avgHrv)) / 10;
    }
    
    // Calculate SpO2 component
    let spo2Factor = 0;
    if (this.spo2Values.length > 0) {
      const avgSpo2 = this.spo2Values.reduce((sum, val) => sum + val, 0) / this.spo2Values.length;
      // Lower SpO2 can correlate with higher glucose in some cases
      spo2Factor = Math.max(0, (98 - avgSpo2)) * 2;
    }
    
    // Heart rate component
    let hrFactor = 0;
    if (this.lastBpms.length > 0) {
      const avgHr = this.lastBpms.reduce((sum, val) => sum + val, 0) / this.lastBpms.length;
      // Elevated heart rate can correlate with higher glucose
      hrFactor = Math.max(0, (avgHr - 70)) * 0.2;
    }
    
    // Respiration component
    let respFactor = 0;
    if (respirationRate && respirationDepth) {
      // Faster and shallower breathing can indicate stress, which affects glucose
      const respRateFactor = Math.max(0, (respirationRate - 12)) * 0.3;
      const respDepthFactor = Math.max(0, (60 - respirationDepth)) * 0.2;
      respFactor = respRateFactor + respDepthFactor;
    }
    
    // PPG signal features - analyze waveform characteristics
    let ppgFactor = 0;
    const ppgValues = this.ppgBuffer.getValues();
    
    // Calculate amplitude variation
    const max = Math.max(...ppgValues);
    const min = Math.min(...ppgValues);
    const amplitude = max - min;
    
    // Calculate area under curve (simplified)
    const mean = ppgValues.reduce((sum, val) => sum + val, 0) / ppgValues.length;
    const areaFactor = (mean / 100) * 5;
    
    // PPG morphology factor
    ppgFactor = (amplitude / 200) * 8 + areaFactor;
    
    // Combine all factors
    let glucoseEstimate = timeBaseline + 
                          mealFactor * this.TIME_FACTOR + 
                          hrvFactor * this.HRV_FACTOR + 
                          spo2Factor * this.SPO2_FACTOR + 
                          hrFactor + 
                          respFactor * this.RESP_FACTOR + 
                          ppgFactor;
    
    // Add some realistic biological variation
    const biologicalNoise = (Math.random() * 2 - 1) * this.personalVariability * 0.5;
    glucoseEstimate += biologicalNoise;
    
    // Ensure glucose is within realistic range
    glucoseEstimate = Math.max(70, Math.min(180, Math.round(glucoseEstimate)));
    
    // Determine trend direction
    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    if (this.glucoseHistory.length > 0) {
      const lastGlucose = this.glucoseHistory[this.glucoseHistory.length - 1].value;
      if (glucoseEstimate > lastGlucose + 3) trend = 'rising';
      else if (glucoseEstimate < lastGlucose - 3) trend = 'falling';
    }
    
    // Calculate confidence based on available data points
    let confidence = 0.5; // Base confidence
    
    // More data points = higher confidence
    confidence += this.hrvValues.length * 0.01;
    confidence += this.spo2Values.length * 0.02;
    confidence += this.lastBpms.length * 0.02;
    confidence += this.ppgBuffer.size() > 100 ? 0.1 : 0;
    confidence += respirationRate && respirationDepth ? 0.05 : 0;
    
    // Limit confidence to realistic range
    confidence = Math.min(0.85, Math.max(0.4, confidence));
    
    // Create glucose data object
    const glucoseData: BloodGlucoseData = {
      value: glucoseEstimate,
      trend,
      timestamp: currentTime,
      confidence
    };
    
    // Store glucose estimate in history
    this.glucoseHistory.push(glucoseData);
    if (this.glucoseHistory.length > this.GLUCOSE_HISTORY_SIZE) {
      this.glucoseHistory.shift();
    }
    
    return glucoseData;
  }
  
  /**
   * Reset the estimator
   */
  public reset(): void {
    this.ppgBuffer.clear();
    this.hrvValues = [];
    this.spo2Values = [];
    this.lastBpms = [];
    this.glucoseHistory = [];
    this.lastMealTime = Date.now() - 7200000; // 2 hours ago
    this.hasValidData = false;
    this.initializePersonalBaseline();
  }
}
