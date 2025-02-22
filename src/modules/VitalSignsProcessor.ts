/**
 * VitalSignsProcessor
 *
 * Procesa datos PPG para estimar (de forma muy aproximada) SpO2, presión arterial
 * y detectar posibles arritmias.
 *
 * ---------------------------------------------------------------------------
 * ADVERTENCIA:
 *  - Código prototipo para DEMO / investigación, **NO** dispositivo médico.
 *  - Presión arterial vía PPG depende de calibraciones, señales reales estables,
 *    y hardware adecuado. Se usa aquí una heurística muy simplificada.
 *  - La detección de arritmias (RR-intervals, Poincaré, etc.) es también
 *    aproximada y requiere validación clínica.
 * ---------------------------------------------------------------------------
 *
 * Ajustes solicitados:
 * 1) Limitar SpO2 en [88, 98], pues 98% suele ser el máximo real en humanos
 *    (para no quedar clavado en 100%).
 * 2) Subir un poco la presión arterial calculada, ya que quedaba muy baja.
 * 3) Hacer la detección de arritmias más sensible, bajando umbrales
 *    (MAX_RR_VARIATION, POINCARE_SD1_THRESHOLD, POINCARE_SD2_THRESHOLD).
 *
 */

export class VitalSignsProcessor {
  //-----------------------------------------
  //        PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Tamaño máximo de buffer de señal PPG (p.e. ~10s a ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (bajamos un poco para no saturar en 100). */
  private readonly SPO2_CALIBRATION_FACTOR = 1.02;

  /**
   * Umbral mínimo de índice de perfusión (AC/DC) para confiar en SpO2.
   * 0.05 significa un perfusionIndex de 5 en notación (%)  
   */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /**
   * Ventana usada para SpO2 (para la media).  
   * Puede ajustarse para hacerlo más reactivo vs estable.
   */
  private readonly SPO2_WINDOW = 10;

  /**
   * Tamaño de ventana para el Smooth Moving Average en cada frame,
   * para suavizar ruido puntual.
   */
  private readonly SMA_WINDOW = 3;

  // ───────── Parámetros de Arritmias ─────────

  /** Fase de aprendizaje (ms) para baseline de RR-intervals (reducido a 5s). */
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 5000;

  /** Máxima variación relativa de RR vs. la baseline para sospechar arritmia (ultra sensible). */
  private readonly MAX_RR_VARIATION = 0.05; // Reducido de 0.10 a 0.05

  /** Número mínimo de latidos (RR) para fijar baseline (reducido). */
  private readonly MIN_CONSECUTIVE_BEATS = 3;

  /** Bajamos drásticamente umbrales Poincaré para detectar más variaciones. */
  private readonly POINCARE_SD1_THRESHOLD = 0.02; // Reducido de 0.05 a 0.02
  private readonly POINCARE_SD2_THRESHOLD = 0.04; // Reducido de 0.10 a 0.04

  /**
   * Umbral de pico más sensible para contar latidos.
   * Ajustado para detectar variaciones más sutiles.
   */
  private readonly PEAK_THRESHOLD = 0.4; // Reducido de 0.6 a 0.4

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  /** Buffer principal de la señal PPG filtrada. */
  private ppgValues: number[] = [];

  /** Valor de SpO2 anterior (para no caer en 0 si la señal empeora). */
  private lastValue = 0;

  /** Última marca temporal (ms) de pico detectado. */
  private lastPeakTime: number | null = null;

  /** Buffer de intervalos RR (tiempo entre picos consecutivos). */
  private rrIntervals: number[] = [];

  /** RR baseline calculado en fase de aprendizaje. */
  private baselineRhythm = 0;

  /** Flag de aprendizaje (true hasta pasar ARRHYTHMIA_LEARNING_PERIOD). */
  private isLearningPhase = true;

  /** Flag si se detectó arritmia. */
  private arrhythmiaDetected = false;

  /** Momento de inicio (ms) para la medición actual. */
  private measurementStartTime: number = Date.now();

  constructor() {
    this.measurementStartTime = Date.now();
  }

  /**
   * processSignal
   * @param ppgValue - valor PPG crudo de la cámara
   * @returns { spo2, pressure, arrhythmiaStatus }
   */
  public processSignal(ppgValue: number): {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
  } {
    // 1) Filtrar con un SMA corto.
    const filteredValue = this.applySMAFilter(ppgValue);

    // 2) Agregar al buffer. Limitar al WINDOW_SIZE.
    this.ppgValues.push(filteredValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // 3) Detectar pico para RR intervals:
    const isPeak = this.detectPeak(filteredValue);
    if (isPeak) {
      this.processHeartBeat();
    }

    // 4) Calcular SpO2 (últimos ~60).
    const chunkForSpO2 = this.ppgValues.slice(-60);
    const spo2 = this.calculateSpO2(chunkForSpO2);

    // 5) Calcular Presión Arterial (igual, últimos ~60).
    const chunkForBP = this.ppgValues.slice(-60);
    const bp = this.calculateBloodPressure(chunkForBP);
    const pressureString = `${bp.systolic}/${bp.diastolic}`;

    // 6) Estado de arritmia (si ya no estamos aprendiendo).
    let arrhythmiaStatus = "--";
    if (!this.isLearningPhase) {
      arrhythmiaStatus = this.arrhythmiaDetected ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS";
    }

    // Retornar resultado.
    return {
      spo2,
      pressure: pressureString,
      arrhythmiaStatus
    };
  }

  // ─────────────────────────────────────────────────
  //             CÁLCULO DE SPO2
  // ─────────────────────────────────────────────────

  private calculateSpO2(values: number[]): number {
    // Se requiere al menos ~30 muestras para estabilidad.
    if (values.length < 30) {
      return this.lastValue;
    }

    // DC (promedio)
    const dc = this.calculateDC(values);
    if (dc === 0) {
      return this.lastValue;
    }

    // AC (rango)
    const ac = this.calculateAC(values);
    const perfusionIndex = (ac / dc) * 100;

    // Si la perfusión es demasiado baja, regresar último SpO2.
    if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD * 100) {
      return this.lastValue;
    }

    // Cálculo base a partir del promedio, con factor de calibración.
    const mean = dc; // (dc es ya el promedio).
    const rawSpO2 = mean * this.SPO2_CALIBRATION_FACTOR;

    // Limitamos entre [88, 98].
    const spO2 = Math.round(Math.max(88, Math.min(98, rawSpO2)));

    // Guardamos por si la señal empeora
    this.lastValue = spO2;
    return spO2;
  }

  // ─────────────────────────────────────────────────
  //         CÁLCULO DE PRESIÓN ARTERIAL
  // ─────────────────────────────────────────────────

  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    // Mínimo ~30 para tener algo de info
    if (values.length < 30) {
      return { systolic: 0, diastolic: 0 };
    }

    // Buscar picos/ valles en este chunk
    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    if (peakIndices.length < 2) {
      return { systolic: 120, diastolic: 80 };
    }

    // Asumamos ~30 FPS => ~33ms / muestra
    const fps = 30;
    const msPerSample = 1000 / fps;

    // PTT (tiempo en ms entre picos consecutivos)
    const pttValues: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(dt);
    }
    let avgPTT = pttValues.reduce((acc, val) => acc + val, 0) / pttValues.length;

    // Evitar extremos
    if (avgPTT < 300) avgPTT = 300;   // ~300ms => FC ~200 BPM, extremo
    if (avgPTT > 1500) avgPTT = 1500; // ~1.5s => FC ~40 BPM, extremo

    // Calcular amplitud pico-valle promedio
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);

    /**
     * Heurísticas:
     *   sistólica ~ 115 - 0.04*(avgPTT - 500) + 0.25*(amplitude)
     *   diastólica ~ 0.65 * sistólica
     * Clamps en [95–180]/[60–115]
     */
    const alphaPTT = 0.04;  // sensibilidad al PTT
    const alphaAmp = 0.25;  // sensibilidad a la amplitud
    let estimatedSystolic = 115 - alphaPTT * (avgPTT - 500) + alphaAmp * amplitude;
    let estimatedDiastolic = estimatedSystolic * 0.65;

    const systolic = Math.round(Math.max(95, Math.min(180, estimatedSystolic)));
    const diastolic = Math.round(Math.max(60, Math.min(115, estimatedDiastolic)));

    return { systolic, diastolic };
  }

  /**
   * localFindPeaksAndValleys
   * Búsqueda simple de picos y valles dentro de "values".
   */
  private localFindPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];

    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      // Pico si v > a i±1, i±2
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        peakIndices.push(i);
      }
      // Valle si v < a i±1, i±2
      if (
        v < values[i - 1] &&
        v < values[i - 2] &&
        v < values[i + 1] &&
        v < values[i + 2]
      ) {
        valleyIndices.push(i);
      }
    }
    return { peakIndices, valleyIndices };
  }

  /**
   * calculateAmplitude
   * Amplitud pico-valle promedio.
   */
  private calculateAmplitude(
    values: number[],
    peaks: number[],
    valleys: number[]
  ): number {
    if (peaks.length === 0 || valleys.length === 0) return 0;

    const amps: number[] = [];
    const len = Math.min(peaks.length, valleys.length);
    for (let i = 0; i < len; i++) {
      // Se asume que peak[i] > valley[i] en tiempo,
      // si no, igual tomamos la diferencia si es >0.
      const amp = values[peaks[i]] - values[valleys[i]];
      if (amp > 0) {
        amps.push(amp);
      }
    }
    if (amps.length === 0) return 0;

    const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
    return mean;
  }

  // ─────────────────────────────────────────────────
  //          DETECCIÓN DE ARRITMIAS (RR)
  // ─────────────────────────────────────────────────

  /**
   * detectPeak
   * Marca un latido cuando value > PEAK_THRESHOLD y pasaron >=500ms 
   * desde el último pico.
   */
  private detectPeak(value: number): boolean {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      // primer latido
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

  /**
   * processHeartBeat
   * Cada vez que detectamos un pico, calculamos RR y chequeamos arritmias.
   */
  private processHeartBeat() {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }

    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);

    // Limitar el buffer de RR
    if (this.rrIntervals.length > 50) {
      this.rrIntervals.shift();
    }

    const timeSinceStart = currentTime - this.measurementStartTime;

    // Fase aprendizaje
    if (this.isLearningPhase && timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD) {
      if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
        this.calculateBaselineRhythm();
      }
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
      }
    } else {
      // Fuera de aprendizaje, checar arritmias
      if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
        this.detectArrhythmia();
      }
    }
  }

  /**
   * calculateBaselineRhythm
   * Baseline con últimos MIN_CONSECUTIVE_BEATS RR.
   */
  private calculateBaselineRhythm() {
    const recent = this.rrIntervals.slice(-this.MIN_CONSECUTIVE_BEATS);
    const sum = recent.reduce((a, b) => a + b, 0);
    this.baselineRhythm = sum / recent.length;
  }

  /**
   * detectArrhythmia
   * Usa variación vs baseline, Poincaré (SD1,SD2) y patrón irregular 
   * para determinar si hay arritmia.
   */
  private detectArrhythmia() {
    if (this.rrIntervals.length < 2) {
      console.log("VitalSignsProcessor: No hay suficientes intervalos RR", {
        rrIntervalsLength: this.rrIntervals.length
      });
      return;
    }

    const sd1 = this.calculatePoincareSD1();
    const sd2 = this.calculatePoincareSD2();
    const lastRR = this.rrIntervals[this.rrIntervals.length - 1];

    // Asegurarse que hay baseline
    if (!this.baselineRhythm) {
      console.log("VitalSignsProcessor: No hay baseline rhythm establecida");
      return;
    }

    // Relación entre el último RR y la baseline
    const rrVariation = Math.abs(lastRR - this.baselineRhythm) / this.baselineRhythm;

    // Checar patrón irregular en los últimos 6 latidos
    const hasIrregularPattern = this.detectIrregularPattern();

    const newArrhythmiaState =
      (sd1 > this.POINCARE_SD1_THRESHOLD && sd2 > this.POINCARE_SD2_THRESHOLD) ||
      (rrVariation > this.MAX_RR_VARIATION) ||
      hasIrregularPattern;

    // Debug detallado de la detección
    console.log("VitalSignsProcessor: Análisis de arritmia", {
      timestamp: new Date().toISOString(),
      sd1,
      sd1Threshold: this.POINCARE_SD1_THRESHOLD,
      sd2,
      sd2Threshold: this.POINCARE_SD2_THRESHOLD,
      lastRR,
      baselineRhythm: this.baselineRhythm,
      rrVariation,
      maxRRVariation: this.MAX_RR_VARIATION,
      hasIrregularPattern,
      isLearningPhase: this.isLearningPhase,
      arrhythmiaDetected: newArrhythmiaState
    });

    if (newArrhythmiaState !== this.arrhythmiaDetected) {
      this.arrhythmiaDetected = newArrhythmiaState;
      console.log("VitalSignsProcessor: Cambio en estado de arritmia", {
        previousState: !this.arrhythmiaDetected,
        newState: this.arrhythmiaDetected,
        isLearningPhase: this.isLearningPhase
      });
    }
  }

  /**
   * calculatePoincareSD1
   * SD1 en diagrama Poincaré = std de ((RR_n+1 - RR_n)/√2)
   */
  private calculatePoincareSD1(): number {
    const n = this.rrIntervals.length;
    if (n < 2) return 0;

    const diffs: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      diffs.push((this.rrIntervals[i + 1] - this.rrIntervals[i]) / Math.sqrt(2));
    }
    return this.calculateStandardDeviation(diffs);
  }

  /**
   * calculatePoincareSD2
   * SD2 en Poincaré = std de ((RR_n+1 + RR_n)/√2)
   */
  private calculatePoincareSD2(): number {
    const n = this.rrIntervals.length;
    if (n < 2) return 0;

    const sums: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      sums.push((this.rrIntervals[i + 1] + this.rrIntervals[i]) / Math.sqrt(2));
    }
    return this.calculateStandardDeviation(sums);
  }

  /**
   * detectIrregularPattern
   * Si en los últimos 6 latidos >= 2 tienen variación de RR > MAX_RR_VARIATION, 
   * lo marcamos como patrón irregular.
   */
  private detectIrregularPattern(): boolean {
    if (this.rrIntervals.length < 6) return false;

    const recent = this.rrIntervals.slice(-6);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;

    let irregularities = 0;
    for (let i = 1; i < recent.length; i++) {
      const variation = Math.abs(recent[i] - recent[i - 1]) / mean;
      if (variation > this.MAX_RR_VARIATION) {
        irregularities++;
      }
    }

    return irregularities >= 2;
  }

  /**
   * calculateStandardDeviation
   * Calcula desviación estándar simple para un array de valores.
   */
  private calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSqDiff);
  }

  // ─────────────────────────────────────────────────
  //           SOPORTE & FILTRO DE ENTRADA
  // ─────────────────────────────────────────────────

  /**
   * calculateAC
   * AC = (max - min) de la ventana actual.
   */
  private calculateAC(values: number[]): number {
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * calculateDC
   * DC = promedio de la ventana actual.
   */
  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * Filtro SMA (Smooth Moving Average) de tamaño 3
   * para mitigar ruido puntual.
   */
  private smaBuffer: number[] = [];
  private applySMAFilter(value: number): number {
    this.smaBuffer.push(value);
    if (this.smaBuffer.length > this.SMA_WINDOW) {
      this.smaBuffer.shift();
    }
    const sum = this.smaBuffer.reduce((a, b) => a + b, 0);
    return sum / this.smaBuffer.length;
  }

  /**
   * reset
   * Reinicia todo el estado interno: buffers, baseline de RR, etc.
   */
  public reset(): void {
    this.ppgValues = [];
    this.smaBuffer = [];
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.baselineRhythm = 0;
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.measurementStartTime = Date.now();
  }
}
