
import { applySMAFilter } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './SpO2Calculator';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 150; // Reducido para permitir una respuesta más rápida
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 1; // Mínimo para mostrar señal casi sin filtrar
  private readonly BPM_SMOOTHING_ALPHA = 0.05; // Reducido para mostrar variaciones naturales
  private lastBPM: number = 0;
  
  // Specialized modules for each vital sign
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
  }

  /**
   * Process incoming PPG signal and calculate vital signs
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

    // Process PPG signal with mínimo filtrado
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Check learning phase
    const isLearning = this.arrhythmiaDetector.isInLearningPhase();
    
    // During learning phase, collect values for SpO2 calibration
    if (isLearning) {
      if (this.ppgValues.length >= 20) { // Reduced window for faster calibration
        const tempSpO2 = this.spO2Calculator.calculateRaw(this.ppgValues.slice(-20));
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
    let pressure = "EVALUANDO"; // Iniciar en "EVALUANDO"

    // Calcular presión con ventana más pequeña para respuesta rápida
    if (this.ppgValues.length >= 30) { // Reducido de 50 a 30 muestras mínimas
      bp = this.bpCalculator.calculate(this.ppgValues.slice(-60)); // Reducido de 100 a 60 muestras
      
      if (bp.systolic > 0 && bp.diastolic > 0) {
        pressure = `${bp.systolic}/${bp.diastolic}`;
        console.log(`VitalSignsProcessor: Presión arterial medida: ${pressure}`);
      } else {
        console.log("VitalSignsProcessor: Valores de presión no válidos, mostrando EVALUANDO");
      }
    } else {
      console.log(`VitalSignsProcessor: Insuficientes datos (${this.ppgValues.length}/30), mostrando EVALUANDO`);
    }

    // Calcular SpO2 con ventana más pequeña
    const spo2 = this.spO2Calculator.calculate(this.ppgValues.slice(-20)); // Reducido de 30 a 20

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
   * @param rawBPM Raw BPM value
   */
  public smoothBPM(rawBPM: number): number {
    if (rawBPM <= 0) return 0;
    
    if (this.lastBPM <= 0) {
      this.lastBPM = rawBPM;
      return rawBPM;
    }
    
    // Mínimo suavizado para mostrar variaciones naturales
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
  }

  /**
   * Apply Simple Moving Average filter to the signal
   */
  private applySMAFilter(value: number): number {
    return applySMAFilter(this.ppgValues, value, this.SMA_WINDOW);
  }
}
