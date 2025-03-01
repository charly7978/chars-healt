
import { applySMAFilter } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './SpO2Calculator';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 30; // Reducido para respuesta más rápida
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 1; // Mínimo para mostrar señal casi cruda
  private readonly BPM_SMOOTHING_ALPHA = 0.01; // Suavizado muy bajo para mostrar variaciones naturales
  private lastBPM: number = 0;
  
  // Módulos especializados para cada signo vital
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
    console.log("VitalSignsProcessor: Instancia creada con filtrado mínimo");
  }

  /**
   * Process incoming PPG signal and calculate vital signs
   * Pasar mediciones reales con filtrado mínimo
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ) {
    const currentTime = Date.now();

    // Actualizar intervalos RR si están disponibles
    if (rrData?.intervals && rrData.intervals.length > 0) {
      // Procesar todos los intervalos sin filtrar
      this.arrhythmiaDetector.updateIntervals(rrData.intervals, rrData.lastPeakTime);
    }

    // Procesar señal PPG con filtrado mínimo
    const filtered = this.applySMAFilter(ppgValue);
    this.ppgValues.push(filtered);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Comprobar fase de aprendizaje
    const isLearning = this.arrhythmiaDetector.isInLearningPhase();
    
    // Durante la fase de aprendizaje, recopilar valores para calibración de SpO2
    if (isLearning) {
      if (this.ppgValues.length >= 10) { // Ventana reducida para calibración más rápida
        const tempSpO2 = this.spO2Calculator.calculateRaw(this.ppgValues.slice(-10));
        if (tempSpO2 > 0) {
          this.spO2Calculator.addCalibrationValue(tempSpO2);
          console.log("Valor de calibración SpO2 añadido:", tempSpO2);
        }
      }
    } else {
      // Auto-calibrar SpO2
      this.spO2Calculator.calibrate();
    }

    // Procesar detección de arritmias
    const arrhythmiaResult = this.arrhythmiaDetector.detect();

    // Calcular signos vitales con ventana mínima
    let bp;
    let pressure = "EVALUANDO"; // Comenzar con "EVALUANDO"

    // Calcular presión con ventana más pequeña para respuesta más rápida
    if (this.ppgValues.length >= 15) { // Reducido de 30 a 15 muestras mínimas
      console.log("VitalSignsProcessor: Calculando BP con mediciones reales");
      bp = this.bpCalculator.calculate(this.ppgValues.slice(-15)); // Reducido para respuesta más rápida
      
      if (bp.systolic > 0 && bp.diastolic > 0) {
        pressure = `${bp.systolic}/${bp.diastolic}`;
        console.log(`VitalSignsProcessor: Medición BP real: ${pressure}`);
      } else {
        console.log("VitalSignsProcessor: Valores BP inválidos, mostrando EVALUANDO");
      }
    } else {
      console.log(`VitalSignsProcessor: Datos insuficientes (${this.ppgValues.length}/15), mostrando EVALUANDO`);
    }

    // Calcular SpO2 con ventana más pequeña
    console.log("VitalSignsProcessor: Calculando SpO2 con datos reales");
    const spo2Values = this.ppgValues.slice(-10); // Usar solo las últimas 10 muestras
    const spo2 = this.spO2Calculator.calculate(spo2Values);
    console.log(`VitalSignsProcessor: SpO2 calculado: ${spo2}, con ${spo2Values.length} muestras`);

    // Preparar datos de arritmia si se detecta
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
    
    // Suavizado mínimo para mostrar variaciones naturales
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
    console.log("VitalSignsProcessor: Reset de todos los procesadores");
  }

  /**
   * Apply Simple Moving Average filter to the signal
   */
  private applySMAFilter(value: number): number {
    return applySMAFilter(this.ppgValues, value, this.SMA_WINDOW);
  }
}
