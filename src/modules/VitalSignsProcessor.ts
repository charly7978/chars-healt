
import { applySMAFilter } from '../utils/signalProcessingUtils';
import { SpO2Calculator } from './SpO2Calculator';
import { BloodPressureCalculator } from './BloodPressureCalculator';
import { ArrhythmiaDetector } from './ArrhythmiaDetector';

export class VitalSignsProcessor {
  private readonly WINDOW_SIZE = 10; // Reducido al mínimo para respuesta inmediata
  private ppgValues: number[] = [];
  private readonly SMA_WINDOW = 0; // Sin filtrado para mostrar señal completamente cruda
  private readonly BPM_SMOOTHING_ALPHA = 0.005; // Mínimo suavizado para mostrar valores reales
  private lastBPM: number = 0;
  
  // Módulos especializados para cada signo vital
  private spO2Calculator: SpO2Calculator;
  private bpCalculator: BloodPressureCalculator;
  private arrhythmiaDetector: ArrhythmiaDetector;
  
  constructor() {
    this.spO2Calculator = new SpO2Calculator();
    this.bpCalculator = new BloodPressureCalculator();
    this.arrhythmiaDetector = new ArrhythmiaDetector();
    console.log("VitalSignsProcessor: Instancia creada SIN filtrado");
  }

  /**
   * Process incoming PPG signal and calculate vital signs
   * Pasar mediciones reales sin filtrado
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ) {
    const currentTime = Date.now();
    console.log("VitalSignsProcessor: Procesando valor PPG:", ppgValue);

    // Actualizar intervalos RR si están disponibles
    if (rrData?.intervals && rrData.intervals.length > 0) {
      // Procesar todos los intervalos sin filtrar
      this.arrhythmiaDetector.updateIntervals(rrData.intervals, rrData.lastPeakTime);
    }

    // Usar valor PPG directo sin filtrar
    this.ppgValues.push(ppgValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Comprobar fase de aprendizaje
    const isLearning = this.arrhythmiaDetector.isInLearningPhase();
    
    // Durante la fase de aprendizaje, recopilar valores para calibración de SpO2
    if (isLearning) {
      if (this.ppgValues.length >= 3) { // Ventana mínima para calibración instantánea
        const tempSpO2 = this.spO2Calculator.calculateRaw(this.ppgValues.slice(-3));
        if (tempSpO2 > 0) {
          this.spO2Calculator.addCalibrationValue(tempSpO2);
          console.log("Valor de calibración SpO2 añadido:", tempSpO2);
        }
      }
    } else {
      // Auto-calibrar SpO2 si es necesario
      this.spO2Calculator.calibrate();
    }

    // Procesar detección de arritmias
    const arrhythmiaResult = this.arrhythmiaDetector.detect();

    // Calcular signos vitales con ventana mínima
    let bp;
    let pressure = "--/--"; // Comenzar con marcador estándar

    // Calcular presión arterial solo si tenemos suficientes datos
    if (this.ppgValues.length >= Math.min(5, this.WINDOW_SIZE)) { 
      console.log("VitalSignsProcessor: Calculando BP con datos crudos");
      bp = this.bpCalculator.calculate(this.ppgValues); 
      
      if (bp && bp.systolic > 0 && bp.diastolic > 0) {
        pressure = `${bp.systolic}/${bp.diastolic}`;
        console.log(`VitalSignsProcessor: Medición BP real: ${pressure}`);
      } else {
        console.log("VitalSignsProcessor: Cálculo BP sin resultado válido");
      }
    } else {
      console.log(`VitalSignsProcessor: Datos insuficientes para BP (${this.ppgValues.length}/${Math.min(5, this.WINDOW_SIZE)})`);
    }

    // Calcular SpO2 con ventana mínima para respuesta inmediata
    console.log("VitalSignsProcessor: Calculando SpO2 con datos crudos");
    const spo2Values = this.ppgValues.slice(-3); // Usar solo las últimas muestras para respuesta inmediata
    const spo2 = spo2Values.length >= 3 ? this.spO2Calculator.calculate(spo2Values) : 0;
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
    
    // Suavizado mínimo para mostrar valores reales
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
    console.log("VitalSignsProcessor: Reset completo de todos los procesadores");
  }

  /**
   * Apply Simple Moving Average filter to the signal
   * NOTA: No se utiliza filtrado para obtener valores reales
   */
  private applySMAFilter(value: number): number {
    // Retornar valor crudo sin filtrar
    return value;
  }
}
