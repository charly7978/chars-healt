export class VitalSignsProcessor {
  //-----------------------------------------
  //             PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Máximo de muestras PPG en el buffer (~10s si ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (ajustado para mediciones más precisas) */
  private readonly SPO2_CALIBRATION_FACTOR = 1.05; // Aumentado para ajustar el rango máximo

  /** Umbral mínimo de índice de perfusión */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /** Ventana de promedios para SpO2 */  
  private readonly SPO2_WINDOW = 10;

  /** Tamaño de la ventana para el SMA */
  private readonly SMA_WINDOW = 3;

  // Nuevos parámetros para detección de arritmias
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 10000; // 10s de aprendizaje
  private readonly MAX_RR_VARIATION = 0.15; // 15% máxima variación normal
  private readonly MIN_CONSECUTIVE_BEATS = 5; // Mínimo de latidos para baseline
  private readonly POINCARE_SD1_THRESHOLD = 0.07; // Umbral de variabilidad a corto plazo
  private readonly POINCARE_SD2_THRESHOLD = 0.15; // Umbral de variabilidad a largo plazo

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  /** Buffer principal de muestras PPG (filtradas con SMA). */
  private ppgValues: number[] = [];

  /** Últimos valores estimados (se devuelven si no hay baseline o detección). */
  private lastSpO2: number = 0;
  private lastSystolic: number = 0;
  private lastDiastolic: number = 0;

  /** Flag que indica si ya tenemos baseline (al menos 60 muestras aceptables). */
  private baselineEstablished = false;

  /** Buffer para promediar SpO2 (para suavizar). */
  private movingAverageSpO2: number[] = [];

  /** Buffer interno para el SMA de cada muestra entrante. */
  private smaBuffer: number[] = [];

  /** Tiempo de inicio de la medición */
  private measurementStartTime: number = 0;

  /** Última presión válida calculada */
  private lastValidPressure: { systolic: number; diastolic: number } | null = null;

  // Variables para arritmias
  private rrIntervals: number[] = [];
  private lastBeatTime: number | null = null;
  private baselineRhythm: number = 0;
  private isLearningPhase = true;
  private arrhythmiaDetected = false;

  constructor() {
    console.log("VitalSignsProcessor: Inicializando procesador de señales vitales");
    this.measurementStartTime = Date.now();
  }

  /**
   * processSignal
   * @param ppgValue Muestra PPG cruda proveniente de la cámara.
   * @returns { spo2, pressure }
   */
  public processSignal(ppgValue: number): { spo2: number; pressure: string } {
    // Detectar picos para RR intervals
    const isPeak = this.detectPeak(ppgValue);
    if (isPeak) {
      this.processHeartBeat();
    }

    // Procesar SpO2 y presión como antes
    const recentValues = this.ppgValues.slice(-60);
    const spo2 = this.calculateActualSpO2(recentValues);
    const pressure = this.calculateActualBloodPressure(recentValues);

    return {
      spo2,
      pressure: `${pressure.systolic}/${pressure.diastolic}`
    };
  }

  private processHeartBeat() {
    const currentTime = Date.now();
    if (this.lastBeatTime === null) {
      this.lastBeatTime = currentTime;
      return;
    }

    const rrInterval = currentTime - this.lastBeatTime;
    this.rrIntervals.push(rrInterval);

    // Mantener solo últimos 50 intervalos
    if (this.rrIntervals.length > 50) {
      this.rrIntervals.shift();
    }

    const timeSinceStart = currentTime - this.measurementStartTime;

    // Fase de aprendizaje
    if (this.isLearningPhase && timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD) {
      if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
        this.calculateBaselineRhythm();
      }
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
      }
    } 
    // Fase de detección
    else if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
      this.detectArrhythmia();
    }

    this.lastBeatTime = currentTime;
  }

  private calculateBaselineRhythm() {
    const recentIntervals = this.rrIntervals.slice(-this.MIN_CONSECUTIVE_BEATS);
    const sum = recentIntervals.reduce((a, b) => a + b, 0);
    this.baselineRhythm = sum / recentIntervals.length;
  }

  private detectArrhythmia() {
    if (this.rrIntervals.length < 2) return;

    // 1. Análisis de Poincaré
    const sd1 = this.calculatePoincareSD1();
    const sd2 = this.calculatePoincareSD2();

    // 2. Variabilidad RR
    const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
    const rrVariation = Math.abs(lastRR - this.baselineRhythm) / this.baselineRhythm;

    // 3. Detección de patrones irregulares
    const hasIrregularPattern = this.detectIrregularPattern();

    // Criterios combinados para arritmia
    const newArrhythmiaState = 
      (sd1 > this.POINCARE_SD1_THRESHOLD && sd2 > this.POINCARE_SD2_THRESHOLD) ||
      (rrVariation > this.MAX_RR_VARIATION) ||
      hasIrregularPattern;

    // Actualizar estado solo si hay cambio
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
    
    // Contar cambios significativos
    let irregularities = 0;
    for (let i = 1; i < recentIntervals.length; i++) {
      const variation = Math.abs(recentIntervals[i] - recentIntervals[i-1]) / mean;
      if (variation > this.MAX_RR_VARIATION) {
        irregularities++;
      }
    }

    return irregularities >= 2; // Al menos 2 irregularidades en 6 latidos
  }

  public reset(): void {
    this.ppgValues = [];
    this.lastSpO2 = 0;
    this.lastSystolic = 0;
    this.lastDiastolic = 0;
    this.baselineEstablished = false;
    this.movingAverageSpO2 = [];
    this.smaBuffer = [];
    this.measurementStartTime = Date.now();
    
    // Reset de variables de arritmia
    this.rrIntervals = [];
    this.lastBeatTime = null;
    this.baselineRhythm = 0;
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
  }
}
