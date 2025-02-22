
export class VitalSignsProcessor {
  //-----------------------------------------
  //             PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Máximo de muestras PPG en el buffer (~10s si ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (ajustado para mediciones más precisas) */
  private readonly SPO2_CALIBRATION_FACTOR = 1.05;

  /** Umbral mínimo de índice de perfusión */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /** Ventana de promedios para SpO2 */  
  private readonly SPO2_WINDOW = 10;

  /** Tamaño de la ventana para el SMA */
  private readonly SMA_WINDOW = 3;

  // Parámetros para detección de arritmias
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 10000;
  private readonly MAX_RR_VARIATION = 0.15;
  private readonly MIN_CONSECUTIVE_BEATS = 5;
  private readonly POINCARE_SD1_THRESHOLD = 0.07;
  private readonly POINCARE_SD2_THRESHOLD = 0.15;
  private readonly PEAK_THRESHOLD = 0.6;

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  private ppgValues: number[] = [];
  private lastValue: number = 0;
  private lastPeakTime: number | null = null;
  private rrIntervals: number[] = [];
  private baselineRhythm: number = 0;
  private isLearningPhase = true;
  private arrhythmiaDetected = false;
  private measurementStartTime: number = Date.now();

  constructor() {
    this.measurementStartTime = Date.now();
  }

  private detectPeak(value: number): boolean {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      if (value > this.PEAK_THRESHOLD) {
        this.lastPeakTime = currentTime;
        return true;
      }
      return false;
    }

    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    if (value > this.PEAK_THRESHOLD && timeSinceLastPeak > 500) {
      this.lastPeakTime = currentTime;
      return true;
    }
    return false;
  }

  public processSignal(ppgValue: number): { 
    spo2: number; 
    pressure: string;
    arrhythmiaStatus: string; // Añadido estado de arritmia
  } {
    this.ppgValues.push(ppgValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Detectar picos para RR intervals
    const isPeak = this.detectPeak(ppgValue);
    if (isPeak) {
      this.processHeartBeat();
    }

    // Calcular SpO2 y presión
    const spo2 = this.calculateSpO2(this.ppgValues.slice(-60));
    const pressure = this.calculateBloodPressure(this.ppgValues.slice(-60));

    return {
      spo2,
      pressure: `${pressure.systolic}/${pressure.diastolic}`,
      arrhythmiaStatus: this.isLearningPhase ? "--" : 
                       (this.arrhythmiaDetected ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS")
    };
  }

  private calculateSpO2(values: number[]): number {
    if (values.length < 30) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.min(99, Math.round(mean * this.SPO2_CALIBRATION_FACTOR));
  }

  private calculateBloodPressure(values: number[]): { systolic: number; diastolic: number } {
    if (values.length < 30) return { systolic: 0, diastolic: 0 };
    const sorted = [...values].sort((a, b) => b - a);
    const systolic = Math.round(120 + (sorted[0] - sorted[sorted.length - 1]) * 30);
    const diastolic = Math.round(80 + (sorted[Math.floor(sorted.length / 2)] - sorted[sorted.length - 1]) * 20);
    return { systolic, diastolic };
  }

  private processHeartBeat() {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }

    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);

    if (this.rrIntervals.length > 50) {
      this.rrIntervals.shift();
    }

    const timeSinceStart = currentTime - this.measurementStartTime;

    if (this.isLearningPhase && timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD) {
      if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
        this.calculateBaselineRhythm();
      }
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
      }
    } else if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
      this.detectArrhythmia();
    }
  }

  private calculateBaselineRhythm() {
    const recentIntervals = this.rrIntervals.slice(-this.MIN_CONSECUTIVE_BEATS);
    const sum = recentIntervals.reduce((a, b) => a + b, 0);
    this.baselineRhythm = sum / recentIntervals.length;
  }

  private detectArrhythmia() {
    if (this.rrIntervals.length < 2) return;

    const sd1 = this.calculatePoincareSD1();
    const sd2 = this.calculatePoincareSD2();
    const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
    const rrVariation = Math.abs(lastRR - this.baselineRhythm) / this.baselineRhythm;
    const hasIrregularPattern = this.detectIrregularPattern();

    const newArrhythmiaState = 
      (sd1 > this.POINCARE_SD1_THRESHOLD && sd2 > this.POINCARE_SD2_THRESHOLD) ||
      (rrVariation > this.MAX_RR_VARIATION) ||
      hasIrregularPattern;

    if (newArrhythmiaState !== this.arrhythmiaDetected) {
      this.arrhythmiaDetected = newArrhythmiaState;
      console.log("VitalSignsProcessor: Estado de arritmia actualizado", {
        arrhythmiaDetected: this.arrhythmiaDetected,
        sd1,
        sd2,
        rrVariation,
        hasIrregularPattern
      });
    }
  }

  private calculatePoincareSD1(): number {
    const n = this.rrIntervals.length;
    if (n < 2) return 0;

    const differences = [];
    for (let i = 0; i < n - 1; i++) {
      differences.push((this.rrIntervals[i+1] - this.rrIntervals[i]) / Math.sqrt(2));
    }

    return this.calculateStandardDeviation(differences);
  }

  private calculatePoincareSD2(): number {
    const n = this.rrIntervals.length;
    if (n < 2) return 0;

    const averages = [];
    for (let i = 0; i < n - 1; i++) {
      averages.push((this.rrIntervals[i+1] + this.rrIntervals[i]) / Math.sqrt(2));
    }

    return this.calculateStandardDeviation(averages);
  }

  private calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / n);
  }

  private detectIrregularPattern(): boolean {
    if (this.rrIntervals.length < 6) return false;

    const recentIntervals = this.rrIntervals.slice(-6);
    const mean = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    
    let irregularities = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const variation = Math.abs(recentIntervals[i] - recentIntervals[i-1]) / mean;
      if (variation > this.MAX_RR_VARIATION) {
        irregularities++;
      }
    }

    return irregularities >= 2;
  }

  public reset(): void {
    this.ppgValues = [];
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.baselineRhythm = 0;
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.measurementStartTime = Date.now();
  }
}
