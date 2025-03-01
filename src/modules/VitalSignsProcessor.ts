
import { applySMAFilter } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './SpO2Calculator';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 50; // Reduced for faster response
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 1; // Minimum to show nearly raw signal
  private readonly BPM_SMOOTHING_ALPHA = 0.01; // Very low smoothing to show natural variations
  private lastBPM: number = 0;
  
  // Specialized modules for each vital sign
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
    console.log("VitalSignsProcessor: Created new instance with minimal filtering");
  }

  /**
   * Process incoming PPG signal and calculate vital signs
   * Pass through real measurements with minimal filtering
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ) {
    const currentTime = Date.now();

    // Update RR intervals if available
    if (rrData?.intervals && rrData.intervals.length > 0) {
      // Process all intervals without filtering
      this.arrhythmiaDetector.updateIntervals(rrData.intervals, rrData.lastPeakTime);
    }

    // Process PPG signal with minimal filtering
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Check learning phase
    const isLearning = this.arrhythmiaDetector.isInLearningPhase();
    
    // During learning phase, collect values for SpO2 calibration
    if (isLearning) {
      if (this.ppgValues.length >= 10) { // Further reduced window for faster calibration
        const tempSpO2 = this.spO2Calculator.calculateRaw(this.ppgValues.slice(-10));
        if (tempSpO2 > 0) {
          this.spO2Calculator.addCalibrationValue(tempSpO2);
        }
      }
    } else {
      // Auto-calibrate SpO2
      this.spO2Calculator.calibrate();
    }

    // Process arrhythmia detection
    const arrhythmiaResult = this.arrhythmiaDetector.detect();

    // Calculate vital signs with minimal window
    let bp;
    let pressure = "EVALUANDO"; // Start with "EVALUATING"

    // Calculate pressure with smaller window for faster response
    if (this.ppgValues.length >= 15) { // Reduced from 30 to 15 minimum samples
      console.log("VitalSignsProcessor: Calculating BP with real measurements");
      bp = this.bpCalculator.calculate(this.ppgValues.slice(-30)); // Reduced from 60 to 30 samples
      
      if (bp.systolic > 0 && bp.diastolic > 0) {
        pressure = `${bp.systolic}/${bp.diastolic}`;
        console.log(`VitalSignsProcessor: Real BP measurement: ${pressure}`);
      } else {
        console.log("VitalSignsProcessor: Invalid BP values, showing EVALUANDO");
      }
    } else {
      console.log(`VitalSignsProcessor: Insufficient data (${this.ppgValues.length}/15), showing EVALUANDO`);
    }

    // Calculate SpO2 with smaller window
    const spo2 = this.spO2Calculator.calculate(this.ppgValues.slice(-10)); // Reduced from 20 to 10

    // Prepare arrhythmia data if detected
    const lastArrhythmiaData = arrhythmiaResult.detected ? {
      timestamp: currentTime,
      rmssd: arrhythmiaResult.data?.rmssd || 0,
      rrVariation: arrhythmiaResult.data?.rrVariation || 0
    } : null;

    return {
      spo2,
      pressure,
      arrhythmiaStatus: arrhythmiaResult.status,
      lastArrhythmiaData
    };
  }

  /**
   * Apply minimal BPM smoothing for direct response
   */
  public smoothBPM(rawBPM: number): number {
    if (rawBPM <= 0) return 0;
    
    if (this.lastBPM <= 0) {
      this.lastBPM = rawBPM;
      return rawBPM;
    }
    
    // Minimal smoothing to show natural variations
    const smoothed = Math.round(
      this.BPM_SMOOTHING_ALPHA * rawBPM + 
      (1 - this.BPM_SMOOTHING_ALPHA) * this.lastBPM
    );
    
    this.lastBPM = smoothed;
    return smoothed;
  }

  /**
   * Reset all processors
   */
  public reset() {
    this.ppgValues = [];
    this.lastBPM = 0;
    this.spO2Calculator.reset();
    this.bpCalculator.reset();
    this.arrhythmiaDetector.reset();
    console.log("VitalSignsProcessor: Reset all processors");
  }

  /**
   * Apply Simple Moving Average filter to the signal
   */
  private applySMAFilter(value: number): number {
    return applySMAFilter(this.ppgValues, value, this.SMA_WINDOW);
  }
}
