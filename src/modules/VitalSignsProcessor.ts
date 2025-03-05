
import { SpO2Calculator } from './spo2';
import { BloodPressureProcessor } from './BloodPressureProcessor';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';
import { GlucoseProcessor } from './GlucoseProcessor';
import { HemoglobinCalculator } from './HemoglobinCalculator';
import { BPMSmoother } from './BPMSmoother';
import { SignalFilter } from './SignalFilter';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private ppgValues: number[] = [];
  private signalQuality: number = 0;
  private measurementCount: number = 0;
  
  // Component modules
  private spO2Calculator: SpO2Calculator;
  private bpProcessor: BloodPressureProcessor;
  private arrhythmiaDetector: ArrhythmiaDetector;
  private glucoseProcessor: GlucoseProcessor;
  private hemoglobinCalculator: HemoglobinCalculator;
  private bpmSmoother: BPMSmoother;
  private signalFilter: SignalFilter;

  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpProcessor = new BloodPressureProcessor();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
    this.glucoseProcessor = new GlucoseProcessor();
    this.hemoglobinCalculator = new HemoglobinCalculator();
    this.bpmSmoother = new BPMSmoother();
    this.signalFilter = new SignalFilter();
    console.log("VitalSignsProcessor initialized with all submodules");
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

    // Process arrhythmia data if available
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

    // Apply signal filtering
    const filtered = this.signalFilter.applySMAFilter(this.ppgValues, ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Learning phase check for SpO2 calibration
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

    // Get results from various processors
    const arrhythmiaResult = this.arrhythmiaDetector.detect();
    const spo2 = this.spO2Calculator.calculate(this.ppgValues.slice(-60));
    const bp = this.bpProcessor.calculate(this.ppgValues.slice(-60));
    const pressure = `${bp.systolic}/${bp.diastolic}`;

    // Calculate glucose
    const glucose = this.glucoseProcessor.calculateGlucose(
      this.ppgValues, 
      this.signalQuality
    );
    
    if (glucose) {
      console.log(`VitalSignsProcessor: Glucose calculated - ${glucose.value} mg/dL (${glucose.trend})`);
    } else {
      console.log(`VitalSignsProcessor: No glucose value available yet`);
    }

    // Calculate hemoglobin
    const hemoglobin = this.hemoglobinCalculator.calculate();

    // Prepare arrhythmia data
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
      hemoglobin
    };
  }

  /**
   * Smooth BPM values for display
   */
  public smoothBPM(rawBPM: number): number {
    return this.bpmSmoother.smooth(rawBPM);
  }

  /**
   * Update signal buffers for hemoglobin calculation
   */
  public updateSignalBuffers(redValue: number, irValue: number): void {
    this.hemoglobinCalculator.updateSignalBuffers(redValue, irValue);
  }

  /**
   * Reset all processors and state
   */
  public reset(): void {
    console.log("VitalSignsProcessor: Resetting all processors");
    this.ppgValues = [];
    this.spO2Calculator.reset();
    this.bpProcessor.reset();
    this.arrhythmiaDetector.reset();
    this.glucoseProcessor.reset();
    this.hemoglobinCalculator.reset();
    this.bpmSmoother.reset();
    
    this.measurementCount = 0;
    this.signalQuality = 0;
  }
}
