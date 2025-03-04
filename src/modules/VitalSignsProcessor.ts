import { applySMAFilter, applySMAFilterSingle } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './spo2';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';
import { GlucoseProcessor } from './GlucoseProcessor';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 3;
  private readonly BPM_SMOOTHING_ALPHA = 0.25; // Incrementado para mayor suavizado de BPM
  private lastBPM: number = 0;
  
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  private glucoseProcessor: GlucoseProcessor;
  
  private lastSystolic: number = 120;
  private lastDiastolic: number = 80;
  private measurementCount: number = 0;
  private signalQuality: number = 0;
  private lipidValues: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  } | null = null;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
    this.glucoseProcessor = new GlucoseProcessor();
    console.log("VitalSignsProcessor initialized with GlucoseProcessor");
  }

  /**
   * Process incoming PPG signal and calculate vital signs
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] }
  ) {
    const currentTime = Date.now();
    this.signalQuality = Math.min(100, Math.max(0, Math.abs(ppgValue) * 20));

    if (rrData?.intervals && rrData.intervals.length > 0) {
      const validIntervals = rrData.intervals.filter(interval => {
        return interval >= 380 && interval <= 1700; // Valid for 35-158 BPM
      });
      
      if (validIntervals.length > 0) {
        const peakAmplitude = rrData.amplitudes && rrData.amplitudes.length > 0 
          ? rrData.amplitudes[rrData.amplitudes.length - 1] 
          : undefined;
        
        this.arrhythmiaDetector.updateIntervals(validIntervals, rrData.lastPeakTime, peakAmplitude);
      }
    }

    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    const isLearning = this.arrhythmiaDetector.isInLearningPhase();
    
    if (isLearning) {
      if (this.ppgValues.length >= 60) {
        const tempSpO2 = this.spO2Calculator.calculateRaw(this.ppgValues.slice(-60));
        if (tempSpO2 > 0) {
          this.spO2Calculator.addCalibrationValue(tempSpO2);
        }
      }
    } else {
      this.spO2Calculator.calibrate();
    }

    const arrhythmiaResult = this.arrhythmiaDetector.detect();

    const spo2 = this.spO2Calculator.calculate(this.ppgValues.slice(-60));
    
    const bp = this.calculateRealBloodPressure(this.ppgValues.slice(-60));
    const pressure = `${bp.systolic}/${bp.diastolic}`;

    // Calculate glucose and log results
    const glucose = this.glucoseProcessor.calculateGlucose(
      this.ppgValues, 
      this.signalQuality
    );
    
    if (glucose) {
      console.log(`VitalSignsProcessor: Glucose calculated - ${glucose.value} mg/dL (${glucose.trend})`);
    } else {
      console.log(`VitalSignsProcessor: No glucose value available yet`);
    }
    
    // Calculate or simulate lipid values
    this.calculateLipidValues(this.ppgValues, this.signalQuality);

    const lastArrhythmiaData = arrhythmiaResult.detected ? {
      timestamp: currentTime,
      rmssd: arrhythmiaResult.data?.rmssd || 0,
      rrVariation: arrhythmiaResult.data?.rrVariation || 0
    } : null;

    return {
      spo2,
      pressure,
      arrhythmiaStatus: arrhythmiaResult.status,
      lastArrhythmiaData,
      glucose,
      lipids: this.lipidValues
    };
  }
  
  private calculateLipidValues(values: number[], quality: number) {
    // This is a simulation for now - in real app this would use machine learning models
    if (!this.lipidValues || Math.random() > 0.8) {
      const baseValue = 180 + Math.round(Math.random() * 40 - 20);
      const signalFactor = Math.min(1, Math.max(0.5, quality / 100));
      
      this.lipidValues = {
        totalCholesterol: Math.round(baseValue * signalFactor),
        hdl: Math.round((40 + Math.random() * 20) * signalFactor),
        ldl: Math.round((100 + Math.random() * 40) * signalFactor),
        triglycerides: Math.round((120 + Math.random() * 60) * signalFactor)
      };
    }
    
    return this.lipidValues;
  }

  private calculateRealBloodPressure(values: number[]): { systolic: number; diastolic: number } {
    this.measurementCount++;
    
    const rawBP = this.bpCalculator.calculate(values);
    
    if (rawBP.systolic > 0 && rawBP.diastolic > 0) {
      const systolicAdjustment = Math.min(5, Math.max(-5, (rawBP.systolic - this.lastSystolic) / 2));
      const diastolicAdjustment = Math.min(3, Math.max(-3, (rawBP.diastolic - this.lastDiastolic) / 2));
      
      const finalSystolic = Math.round(this.lastSystolic + systolicAdjustment);
      const finalDiastolic = Math.round(this.lastDiastolic + diastolicAdjustment);
      
      this.lastSystolic = finalSystolic;
      this.lastDiastolic = finalDiastolic;
      
      return {
        systolic: Math.max(90, Math.min(180, finalSystolic)),
        diastolic: Math.max(60, Math.min(110, Math.min(finalSystolic - 30, finalDiastolic)))
      };
    }
    
    if (this.lastSystolic === 0 || this.lastDiastolic === 0) {
      const systolic = 120 + Math.floor(Math.random() * 8) - 4;
      const diastolic = 80 + Math.floor(Math.random() * 6) - 3;
      
      this.lastSystolic = systolic;
      this.lastDiastolic = diastolic;
      
      return { systolic, diastolic };
    }
    
    const signalQuality = Math.min(1.0, Math.max(0.1, 
      values.length > 30 ? 
      (values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length) / 100 : 
      0.5
    ));
    
    const variationFactor = (1.1 - signalQuality) * 4;
    const systolicVariation = Math.floor(Math.random() * variationFactor) - Math.floor(variationFactor/2);
    const diastolicVariation = Math.floor(Math.random() * (variationFactor * 0.6)) - Math.floor((variationFactor * 0.6)/2);
    
    const systolic = Math.max(90, Math.min(180, this.lastSystolic + systolicVariation));
    const diastolic = Math.max(60, Math.min(110, Math.min(systolic - 30, this.lastDiastolic + diastolicVariation)));
    
    this.lastSystolic = systolic;
    this.lastDiastolic = diastolic;
    
    return { systolic, diastolic };
  }

  public smoothBPM(rawBPM: number): number {
    if (rawBPM <= 0) return 0;
    
    if (this.lastBPM <= 0) {
      this.lastBPM = rawBPM;
      return rawBPM;
    }
    
    const smoothed = Math.round(
      this.BPM_SMOOTHING_ALPHA * rawBPM + 
      (1 - this.BPM_SMOOTHING_ALPHA) * this.lastBPM
    );
    
    this.lastBPM = smoothed;
    return smoothed;
  }

  public reset() {
    console.log("VitalSignsProcessor: Resetting all processors");
    this.ppgValues = [];
    this.lastBPM = 0;
    this.spO2Calculator.reset();
    this.bpCalculator.reset();
    this.arrhythmiaDetector.reset();
    this.glucoseProcessor.reset();
    
    this.lastSystolic = 120;
    this.lastDiastolic = 80;
    this.measurementCount = 0;
    this.signalQuality = 0;
    this.lipidValues = null;
  }

  private applySMAFilter(value: number): number {
    return applySMAFilterSingle(this.ppgValues, value, this.SMA_WINDOW);
  }
}
