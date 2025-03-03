import { applySMAFilter } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './spo2';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';
import { RespiratoryRateProcessor } from './RespiratoryRateProcessor';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 300;
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 3;
  private readonly BPM_SMOOTHING_ALPHA = 0.25; // Incrementado para mayor suavizado de BPM
  private lastBPM: number = 0;
  
  // Specialized modules for each vital sign
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  // NUEVO: Procesador de tasa respiratoria
  private respiratoryProcessor: RespiratoryRateProcessor;
  
  // Variables para medición real - valores iniciales basados en estadísticas médicas reales
  private lastSystolic: number = 120;
  private lastDiastolic: number = 80;
  private measurementCount: number = 0;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
    // NUEVO: Inicializar procesador respiratorio
    this.respiratoryProcessor = new RespiratoryRateProcessor();
  }

  /**
   * Process incoming PPG signal and calculate vital signs
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] }
  ) {
    const currentTime = Date.now();

    // Update RR intervals if available
    if (rrData?.intervals && rrData.intervals.length > 0) {
      // Filter outliers
      const validIntervals = rrData.intervals.filter(interval => {
        return interval >= 400 && interval <= 1500; // 40-150 BPM
      });
      
      if (validIntervals.length > 0) {
        this.arrhythmiaDetector.updateIntervals(validIntervals, rrData.lastPeakTime, rrData.amplitudes && rrData.amplitudes.length > 0 ? rrData.amplitudes[rrData.amplitudes.length - 1] : undefined);
      }
    }

    // Process PPG signal
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Check learning phase
    const isLearning = this.arrhythmiaDetector.isInLearningPhase();

    // Arrhythmia detection
    const arrhythmiaResult = this.arrhythmiaDetector.detect();

    // Calculate blood pressure
    const bp = this.calculateRealBloodPressure(this.ppgValues);
    const pressure = `${bp.systolic}/${bp.diastolic}`;

    // Calculate SpO2
    const spo2 = this.spO2Calculator.calculate(this.ppgValues.slice(-60));
    
    // NUEVO: Calcular tasa respiratoria
    // La calidad de señal para la respiración se puede basar en varios factores
    const signalQuality = Math.min(100, 
      isLearning ? 50 : // Durante aprendizaje, calidad moderada
      arrhythmiaResult.detected ? 65 : // Durante arritmia, calidad algo reducida
      80); // Calidad normal
    
    const respData = this.respiratoryProcessor.processSignal(filtered, signalQuality);
    
    // Preparar datos de arritmia si se detectó
    const lastArrhythmiaData = arrhythmiaResult.detected ? {
      timestamp: currentTime,
      rmssd: arrhythmiaResult.data?.rmssd || 0,
      rrVariation: arrhythmiaResult.data?.rrVariation || 0
    } : null;
    
    this.measurementCount++;

    return {
      spo2,
      pressure,
      arrhythmiaStatus: arrhythmiaResult.status,
      lastArrhythmiaData,
      // NUEVO: Incluir datos respiratorios
      respiratoryRate: respData ? respData.rate : 0,
      respiratoryPattern: respData ? respData.pattern : 'unknown',
      respiratoryConfidence: respData ? respData.confidence : 0
    };
  }

  /**
   * Calcula valores de presión arterial reales basados en datos biométricos
   */
  private calculateRealBloodPressure(values: number[]): { systolic: number; diastolic: number } {
    if (values.length < 30) {
      return { systolic: this.lastSystolic, diastolic: this.lastDiastolic };
    }
    
    try {
      // Use BP calculator for accurate measurement
      const result = this.bpCalculator.calculate(values);
      
      if (result.systolic > 0 && result.diastolic > 0) {
        // Update last valid values
        this.lastSystolic = result.systolic;
        this.lastDiastolic = result.diastolic;
        return result;
      }
      
      // If calculator returned invalid values, use last valid ones
      return { 
        systolic: this.lastSystolic,
        diastolic: this.lastDiastolic
      };
    } catch (error) {
      console.error('Error calculating blood pressure:', error);
      return { 
        systolic: this.lastSystolic,
        diastolic: this.lastDiastolic
      };
    }
  }

  /**
   * Smooth BPM for more natural fluctuations
   * @param rawBPM Raw BPM value
   */
  public smoothBPM(rawBPM: number): number {
    if (rawBPM <= 0) {
      return this.lastBPM > 0 ? this.lastBPM : 0;
    }
    
    if (this.lastBPM <= 0) {
      this.lastBPM = rawBPM;
      return rawBPM;
    }
    
    // Apply exponential smoothing
    const smoothedBPM = Math.round(
      this.BPM_SMOOTHING_ALPHA * rawBPM + 
      (1 - this.BPM_SMOOTHING_ALPHA) * this.lastBPM
    );
    
    this.lastBPM = smoothedBPM;
    return smoothedBPM;
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
    // NUEVO: Resetear procesador respiratorio
    this.respiratoryProcessor.reset();
    
    // Reset BP estimates
    this.lastSystolic = 120;
    this.lastDiastolic = 80;
    this.measurementCount = 0;
  }

  /**
   * Apply Simple Moving Average filter to the signal
   */
  private applySMAFilter(value: number): number {
    return applySMAFilter(this.ppgValues, value, this.SMA_WINDOW);
  }
}
