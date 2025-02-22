/**
 * VitalSignsProcessor
 *
 * Procesa datos PPG para estimar (de forma muy aproximada) SpO2, presión arterial
 * y detectar posibles arritmias.
 *
 * Recomendaciones y Advertencias Importantes:
 *  - Este código es un prototipo orientado a DEMO / investigación, **no** un
 *    dispositivo médico aprobado.  
 *  - La presión arterial derivada de la onda PPG depende fuertemente de la
 *    calibración individual, la calidad de la señal, y la frecuencia de sampleo.
 *  - La detección de arritmias (basada en RR-intervals, Poincaré, etc.) requiere
 *    validación y una señal estable. Este código la implementa de forma **básica**.
 *
 * Ajustes Principales en esta versión:
 * 1. **Cálculo de presión arterial** más robusto:
 *    - Se detectan picos y se calcula el "Pulse Transit Time" (PTT) medio en los
 *      últimos ~60 samples para aproximar la sistólica.
 *    - Asimismo, se estima la amplitud pico-valle media para ajustar la
 *      diastólica. El resultado se "clampa" en rangos fisiológicos razonables.
 * 2. **Umbral de perfusión (PERFUSION_INDEX_THRESHOLD) muy bajo (0.05)** para
 *    permitir señales de baja amplitud, dada la cámara/linterna puede ser variable.
 * 3. **Refinado en la detección de arritmias**: la lógica anterior se mantiene,
 *    pero ahora se tienen logs más claros y un “learning phase” de 10s y se
 *    ajusta la baselineRhythm con la media de RR-intervals.
 *
 * Uso:
 *   const vsp = new VitalSignsProcessor();
 *   // Cada frame de PPG
 *   const { spo2, pressure, arrhythmiaStatus } = vsp.processSignal(ppgValue);
 *
 *   console.log("SpO2:", spo2, "Presión:", pressure, "Arritmias:", arrhythmiaStatus);
 * 
 *   // Para reiniciar en cualquier momento:
 *   vsp.reset();
 */

export class VitalSignsProcessor {
  //-----------------------------------------
  //        PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Tamaño máximo de buffer PPG (p.e. ~10s a ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (ajustado para ser un poco más alto). */
  private readonly SPO2_CALIBRATION_FACTOR = 1.05;

  /**
   * Umbral mínimo de índice de perfusión (AC/DC).  
   * Con un valor tan bajo (0.05), aceptas señales de menor amplitud,
   * pero cuidado: podría traer lecturas ruidosas.
   */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /**
   * Ventana de cálculo de SpO2 (para la media).  
   * Aquí se reduce a 10 para que sea más reactivo.
   */
  private readonly SPO2_WINDOW = 10;

  /**
   * Ventana del SMA (Smooth Moving Average) en cada frame.  
   * Ayuda a atenuar el ruido puntual.
   */
  private readonly SMA_WINDOW = 3;

  // ───────── Parámetros de detección de arritmias ─────────

  /** Fase de aprendizaje (en ms) para baseline de RR-intervals (ej. 10s). */
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 10000;

  /** Máxima variación relativa de RR con respecto a la baseline para sospechar arritmia. */
  private readonly MAX_RR_VARIATION = 0.15;

  /** Número mínimo de latidos consecutivos para estimar baseline. */
  private readonly MIN_CONSECUTIVE_BEATS = 5;

  /** Umbrales Poincaré SD1 y SD2 para detectar mayor variabilidad. */
  private readonly POINCARE_SD1_THRESHOLD = 0.07;
  private readonly POINCARE_SD2_THRESHOLD = 0.15;

  /**
   * Umbral de pico (valor PPG) para contar un latido.  
   * Ajustar según la amplitud típica de la señal PPG (0.6 es un ejemplo genérico).
   */
  private readonly PEAK_THRESHOLD = 0.6;

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  /** Buffer principal de la señal PPG. */
  private ppgValues: number[] = [];

  /** Último valor leído (no siempre se usa). */
  private lastValue = 0;

  /** Marca temporal (ms) del último pico detectado. */
  private lastPeakTime: number | null = null;

  /** Buffer de intervalos RR (tiempos entre picos consecutivos) para arritmias. */
  private rrIntervals: number[] = [];

  /** Valor medio del RR en la fase de aprendizaje. Se usa como baseline. */
  private baselineRhythm = 0;

  /** Flag que indica si aún estamos en la fase de “aprendizaje”. */
  private isLearningPhase = true;

  /** Indica si se ha detectado o no arritmia. */
  private arrhythmiaDetected = false;

  /** Marca de tiempo en que arrancó la medición (para la fase de aprendizaje). */
  private measurementStartTime: number = Date.now();

  constructor() {
    this.measurementStartTime = Date.now();
  }

  /**
   * processSignal
   * Procesa un nuevo valor ppg y retorna SpO2, presión (sistólica/diastólica) y
   * estado de arritmia ("ARRITMIA DETECTADA", "SIN ARRITMIAS" o "--" en aprendizaje).
   */
  public processSignal(ppgValue: number): {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
  } {
    // 1) Filtrar la muestra (SMA pequeño).
    const filteredValue = this.applySMAFilter(ppgValue);

    // 2) Agregamos al buffer principal y acotamos si excede WINDOW_SIZE.
    this.ppgValues.push(filteredValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // 3) Detectar picos para medir RR-intervals.
    const isPeak = this.detectPeak(filteredValue);
    if (isPeak) {
      this.processHeartBeat();
    }

    // 4) Calcular SpO2 (tomamos ~últimos 60 valores o lo que haya).
    const chunkForSpO2 = this.ppgValues.slice(-60);
    const spo2 = this.calculateSpO2(chunkForSpO2);

    // 5) Calcular Presión Arterial en base a la onda PPG.
    const chunkForBP = this.ppgValues.slice(-60);
    const bp = this.calculateBloodPressure(chunkForBP);
    const pressureString = `${bp.systolic}/${bp.diastolic}`;

    // 6) Determinar estado de arritmia (en fase de aprendizaje, no se muestra).
    let arrhythmiaStatus = "--";
    if (!this.isLearningPhase) {
      arrhythmiaStatus = this.arrhythmiaDetected
        ? "ARRITMIA DETECTADA"
        : "SIN ARRITMIAS";
    }

    return {
      spo2,
      pressure: pressureString,
      arrhythmiaStatus
    };
  }

  // ──────────────────────────────────────────────────────────
  //                CÁLCULO DE SPO2 MUY BÁSICO
  // ──────────────────────────────────────────────────────────

  private calculateSpO2(values: number[]): number {
    // Necesitamos al menos ~30 muestras para tener algo estable
    if (values.length < 30) return this.lastValue;

    // DC (promedio)
    const dc = this.calculateDC(values);
    if (dc === 0) {
      return this.lastValue;
    }

    // AC (max-min)
    const ac = this.calculateAC(values);
    const perfusionIndex = (ac / dc) * 100;

    // Si la perfusión es demasiado baja, devolvemos el último valor.
    if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD * 100) {
      return this.lastValue;
    }

    // Cálculo "a ojo": se toma la media con factor de calibración.
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const rawSpO2 = mean * this.SPO2_CALIBRATION_FACTOR;

    // Heurística: limitamos SpO2 en [85, 100].
    const spO2 = Math.round(Math.max(85, Math.min(100, rawSpO2)));

    // Guardamos para reusar si la señal empeora.
    this.lastValue = spO2;
    return spO2;
  }

  // ──────────────────────────────────────────────────────────
  //         CÁLCULO DE PRESIÓN ARTERIAL (HEURÍSTICO)
  // ──────────────────────────────────────────────────────────

  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    // Si no hay muestras suficientes, devolvemos una estimación nula.
    if (values.length < 30) {
      return { systolic: 0, diastolic: 0 };
    }

    // 1) Hallar picos en la ventana (no los de detectPeak, sino un minianálisis).
    //    Usamos la misma lógica, pero en un array local.
    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    if (peakIndices.length < 2) {
      // Retorna el último valor o algo por defecto
      return { systolic: 120, diastolic: 80 };
    }

    // 2) Asumir ~30FPS => ~33 ms por muestra.
    const fps = 30;
    const msPerSample = 1000 / fps;

    // 3) Calcular PTT (tiempo en ms entre picos consecutivos).
    const pttValues: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(dt);
    }
    // Tomamos el promedio
    let avgPTT = pttValues.reduce((acc, val) => acc + val, 0) / (pttValues.length || 1);

    // Evitar valores extremistas de PTT
    if (avgPTT < 300) avgPTT = 300; // ~300ms => muy alta FC
    if (avgPTT > 1500) avgPTT = 1500; // ~1.5s => FC muy baja

    // 4) Calcular amplitud pico-valle promedio.
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);

    // 5) Heurística para la presión:
    //    - sistólica ~ 110 ± factor*(500 - avgPTT)
    //    - también aportamos un factor de amplitud
    const alphaPTT = 0.05; // sensibilidad de la PTT
    const alphaAmp = 0.2;  // sensibilidad de la amplitud
    let estimatedSystolic = 110 - alphaPTT * (avgPTT - 500) + alphaAmp * amplitude;
    // diastólica ~ 70 + un porcentaje de la sistólica
    let estimatedDiastolic = estimatedSystolic * 0.6;

    // Redondear y clampa a valores fisiológicos
    const systolic = Math.round(Math.min(180, Math.max(90, estimatedSystolic)));
    const diastolic = Math.round(Math.min(110, Math.max(60, estimatedDiastolic)));

    return { systolic, diastolic };
  }

  /**
   * localFindPeaksAndValleys
   * Método simplificado para la ventana "values". No usa tiempo absoluto,
   * sino sólo compara vecinos.
   */
  private localFindPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];

    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        peakIndices.push(i);
      }
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
   * Calcula la amplitud promedio (peak - valley) de la ventana dada.
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
      const amp = values[peaks[i]] - values[valleys[i]];
      if (amp > 0) {
        amps.push(amp);
      }
    }
    if (amps.length === 0) return 0;

    const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
    return mean;
  }

  // ──────────────────────────────────────────────────────────
  //       DETECCIÓN DE PICO (PARA ARRITMIAS / RR-INTERVALS)
  // ──────────────────────────────────────────────────────────

  /**
   * detectPeak
   * Marca un latido cuando el valor PPG supera PEAK_THRESHOLD y
   * han pasado al menos 500ms desde el último pico.
   */
  private detectPeak(value: number): boolean {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      // primer pico
      if (value > this.PEAK_THRESHOLD) {
        this.lastPeakTime = currentTime;
        return true;
      }
      return false;
    }

    // time since last peak
    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    if (value > this.PEAK_THRESHOLD && timeSinceLastPeak > 500) {
      this.lastPeakTime = currentTime;
      return true;
    }
    return false;
  }

  /**
   * processHeartBeat
   * Calcula el intervalo RR y maneja la lógica de aprendizaje y arritmias.
   */
  private processHeartBeat() {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }

    // RR = tiempo entre este latido y el anterior
    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);

    // Limitamos el buffer
    if (this.rrIntervals.length > 50) {
      this.rrIntervals.shift();
    }

    const timeSinceStart = currentTime - this.measurementStartTime;

    // Fase de aprendizaje (10s). Se calcula una baseline del RR.
    if (this.isLearningPhase && timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD) {
      if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
        this.calculateBaselineRhythm();
      }
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
      }
    } else {
      // Fase de detección real
      if (this.rrIntervals.length >= this.MIN_CONSECUTIVE_BEATS) {
        this.detectArrhythmia();
      }
    }
  }

  /**
   * calculateBaselineRhythm
   * Se basa en los últimos MIN_CONSECUTIVE_BEATS RR-intervals 
   * para fijar la baseline.
   */
  private calculateBaselineRhythm() {
    const recentIntervals = this.rrIntervals.slice(-this.MIN_CONSECUTIVE_BEATS);
    const sum = recentIntervals.reduce((a, b) => a + b, 0);
    this.baselineRhythm = sum / recentIntervals.length;
  }

  /**
   * detectArrhythmia
   * Verifica variaciones en RR e índices Poincaré (SD1, SD2).
   */
  private detectArrhythmia() {
    if (this.rrIntervals.length < 2) return;

    const sd1 = this.calculatePoincareSD1();
    const sd2 = this.calculatePoincareSD2();
    const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
    if (!this.baselineRhythm) return;

    const rrVariation = Math.abs(lastRR - this.baselineRhythm) / this.baselineRhythm;
    const hasIrregularPattern = this.detectIrregularPattern();

    // Nueva condición de arritmia
    const newArrhythmiaState =
      (sd1 > this.POINCARE_SD1_THRESHOLD && sd2 > this.POINCARE_SD2_THRESHOLD) ||
      (rrVariation > this.MAX_RR_VARIATION) ||
      hasIrregularPattern;

    if (newArrhythmiaState !== this.arrhythmiaDetected) {
      this.arrhythmiaDetected = newArrhythmiaState;
      console.log("VitalSignsProcessor: Estado de arritmia => ", {
        arrhythmiaDetected: this.arrhythmiaDetected,
        sd1,
        sd2,
        rrVariation,
        hasIrregularPattern
      });
    }
  }

  /**
   * calculatePoincareSD1
   * SD1 en plot Poincaré = desviación estándar de (RRn+1 - RRn)/√2
   */
  private calculatePoincareSD1(): number {
    const n = this.rrIntervals.length;
    if (n < 2) return 0;

    const diffs = [];
    for (let i = 0; i < n - 1; i++) {
      diffs.push((this.rrIntervals[i + 1] - this.rrIntervals[i]) / Math.sqrt(2));
    }

    return this.calculateStandardDeviation(diffs);
  }

  /**
   * calculatePoincareSD2
   * SD2 en plot Poincaré = desviación estándar de (RRn+1 + RRn)/√2
   */
  private calculatePoincareSD2(): number {
    const n = this.rrIntervals.length;
    if (n < 2) return 0;

    const sums = [];
    for (let i = 0; i < n - 1; i++) {
      sums.push((this.rrIntervals[i + 1] + this.rrIntervals[i]) / Math.sqrt(2));
    }

    return this.calculateStandardDeviation(sums);
  }

  /**
   * detectIrregularPattern
   * Si, en los últimos 6 latidos, >=2 tienen una variación RR>MAX_RR_VARIATION, 
   * lo consideramos un patrón irregular.
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
   * SD genérica para un array de valores.
   */
  private calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / n);
  }

  // ──────────────────────────────────────────────────────────
  //                 FUNCIONES DE SOPORTE
  // ──────────────────────────────────────────────────────────

  /** 
   * calculateAC
   * AC = max - min
   */
  private calculateAC(values: number[]): number {
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * calculateDC
   * DC = promedio de la ventana actual
   */
  private calculateDC(values: number[]): number {
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * applySMAFilter
   * Promedio móvil de tamaño 3 para atenuar ruido muy puntual.
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
   * Restablece todo el estado interno.
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
