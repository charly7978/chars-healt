/**
 * HeartBeatProcessor
 *
 * Procesa la señal PPG para estimar la frecuencia cardíaca y emite un beep
 * cada vez que el detector de picos (basado en la misma señal que se grafica)
 * identifica un pico real.  
 *
 * Además, incluye un sistema simple de detección de arritmias:
 *   - Durante los primeros 10s (LEARNING_PERIOD_MS), mide los intervalos entre latidos
 *     para calcular un "ritmo base" (baselineRhythm).
 *   - Luego, compara cada nuevo intervalo con ese ritmo base. Si la diferencia porcentual
 *     excede RHYTHM_TOLERANCE, se incrementa arrhythmiaCount.
 *
 * Ajustes clave para evitar falsos picos al retirar el dedo:
 *   1) autoResetIfSignalIsLow(...) revisa la amplitud. Si es muy baja
 *      (LOW_SIGNAL_THRESHOLD) por varios frames consecutivos (LOW_SIGNAL_FRAMES),
 *      ejecuta resetDetectionStates() para limpiar buffers de picos.
 *   2) El beep se dispara solo si la detección de picos confirma un pico real
 *      (misma señal que se grafica).
 *   3) Se mantuvieron los estados de arritmia (rhythmLearningIntervals, baselineRhythm, etc.)
 *      incluso cuando se hace auto-reset de la detección de picos, para no perder
 *      la información de la fase de aprendizaje.
 *
 * Si aun así la arritmia no se detecta, revisa que el umbral (SIGNAL_THRESHOLD = 0.60)
 * no sea demasiado alto para tu señal real. Ajusta según la amplitud típica
 * de tu pulso (por ejemplo, 0.4–0.5).
 */

export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────

  // Frecuencia de muestreo (aprox. 30 FPS).
  private readonly SAMPLE_RATE = 30;

  // Tamaño de buffer para graficar la señal (2 s a 30 FPS).
  private readonly WINDOW_SIZE = 60;

  // Rango plausible de BPM (40 - 180).
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 180;

  // Parámetros de detección de pico.
  //  (Ajustar SIGNAL_THRESHOLD si la señal es pequeña o grande)
  private readonly SIGNAL_THRESHOLD = 0.50;        // Ajustado. Antes estaba en 0.90
  private readonly MIN_CONFIDENCE = 0.80;
  private readonly DERIVATIVE_THRESHOLD = -0.05;
  private readonly MIN_PEAK_TIME_MS = 600;         // Evita picos más rápidos que ~150 BPM
  private readonly WARMUP_TIME_MS = 5000;

  // Parámetros de filtrado.
  private readonly MEDIAN_FILTER_WINDOW = 5;
  private readonly MOVING_AVERAGE_WINDOW = 7;
  private readonly EMA_ALPHA = 0.2;
  private readonly BASELINE_FACTOR = 0.998;

  // Parámetros de beep.
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 60;
  private readonly MIN_BEEP_INTERVAL_MS = 300;

  // ────────── AUTO-RESET SI LA SEÑAL ES MUY BAJA ──────────
  private readonly LOW_SIGNAL_THRESHOLD = 0.03;
  private readonly LOW_SIGNAL_FRAMES = 10;
  private lowSignalCount = 0;

  // ────────── VARIABLES INTERNAS ──────────

  // Buffers de filtrado.
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];

  // Para el EMA.
  private smoothedValue: number = 0;

  // AudioContext.
  private audioContext: AudioContext | null = null;
  private lastBeepTime = 0;

  // Detección de picos / BPM.
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private bpmHistory: number[] = [];

  // Baseline y derivadas.
  private baseline: number = 0;
  private lastValue: number = 0;   // Para derivada
  private values: number[] = [];   // Pequeña ventana de 3 muestras para derivada
  private startTime: number = 0;   // Para warm-up

  // Confirmación de pico (triple verificación).
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  // Suavizado del BPM (EMA extra).
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2;

  // "Peak candidate" (si quisieras guardar índice/amplitud, opcional).
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;

  // ────────── DETECCIÓN DE ARRITMIAS ──────────
  private readonly LEARNING_PERIOD_MS = 10000;  // 10s de aprendizaje
  private readonly RHYTHM_TOLERANCE = 0.15;     // 15% de variación permitida

  private rhythmLearningIntervals: number[] = [];
  private lastRhythmTime: number | null = null;
  private isLearningPhase = true;
  private baselineRhythm: number = 0;
  public arrhythmiaCount: number = 0; // Expuesto públicamente

  // Marca de inicio de medición (para saber cuántos ms han pasado).
  private measurementStartTime: number = 0;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
    this.measurementStartTime = Date.now();
  }

  // ────────── AUDIO (BEEP) ──────────

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      // Pequeño beep de prueba
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio Context Initialized");
    } catch (err) {
      console.error("HeartBeatProcessor: Error initializing audio", err);
    }
  }

  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext || this.isInWarmup()) return;

    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        this.BEEP_FREQUENCY,
        this.audioContext.currentTime
      );

      // Fade in ~10ms, fade out ~40-50ms
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.05
      );

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.06);

      this.lastBeepTime = now;
    } catch (err) {
      console.error("HeartBeatProcessor: Error playing beep", err);
    }
  }

  // ────────── CONTROL DE TIEMPO PARA WARM-UP ──────────

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  // ────────── FILTROS: MEDIANA / MÓVIL / EMA ──────────

  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue =
      this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  // ────────── PROCESAR SEÑAL POR MUESTRA ──────────

  /**
   * processSignal
   * Procesa un valor de señal PPG y retorna info sobre BPM,
   * confianza y si se detectó un pico real en esta muestra,
   * además del número de arritmias acumulado (arrhythmiaCount).
   */
  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
  } {
    // 1) Filtro de mediana
    const medVal = this.medianFilter(value);

    // 2) Promedio móvil
    const movAvgVal = this.calculateMovingAverage(medVal);

    // 3) Suavizado exponencial
    const smoothed = this.calculateEMA(movAvgVal);

    // Buffer para gráfico
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Asegurar al menos ~30 frames para iniciar
    if (this.signalBuffer.length < 30) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: this.arrhythmiaCount
      };
    }

    // Baseline muy suave
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    // Valor "normalizado"
    const normalizedValue = smoothed - this.baseline;

    // Auto-reset si señal está muy baja (para no arrastrar picos "fantasmas")
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    // Derivada "suave"
    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;

    // Intento de pico
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);

    // Verificación final de pico
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Si se confirma y no estamos en warm-up, actualizamos BPM & beep
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      // Verificar sea un pico temporalmente válido
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;

        // Análisis de intervalos para arritmia
        this.analyzeRhythm(now);

        // Beep cuando confirmamos pico
        this.playBeep(0.12);
        // Actualizar BPM
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed,
      arrhythmiaCount: this.arrhythmiaCount
    };
  }

  /**
   * autoResetIfSignalIsLow
   * Si la señal permanece por debajo de LOW_SIGNAL_THRESHOLD
   * durante LOW_SIGNAL_FRAMES consecutivos, limpia las variables
   * de detección de picos (sin afectar la lógica de arritmias).
   */
  private autoResetIfSignalIsLow(amplitude: number) {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = 0;
    }
  }

  /**
   * resetDetectionStates
   * Limpia las variables que afectan la detección de picos,
   * evitando que queden "picos rezagados" en los buffers.
   * NO tocamos la información de arritmias para que siga
   * acumulando o usando su baseline si ya terminó el aprendizaje.
   */
  private resetDetectionStates() {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    console.log("HeartBeatProcessor: auto-reset detection states (low signal).");
  }

  // ────────── DETECCIÓN / CONFIRMACIÓN DE PICO ──────────

  /**
   * detectPeak
   * Aplica criterios básicos para decidir si la muestra puede ser un pico
   * (derivada negativa + amplitud por encima de SIGNAL_THRESHOLD).
   */
  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;

    // Impedir picos muy seguidos
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Criterios de pico
    const isPeak =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline;

    // Confianza por amplitud y pendiente
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 2), 0),
      1
    );
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD), 0),
      1
    );

    const confidence = (amplitudeConfidence + derivativeConfidence) / 2;

    return { isPeak, confidence };
  }

  /**
   * confirmPeak
   * Para reducir falsos positivos, se requiere ver varios frames
   * que muestren descenso claro tras el supuesto pico.
   */
  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number
  ): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }

    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 3) {
        const len = this.peakConfirmationBuffer.length;
        // Verificar que las últimas 3 muestras vayan decreciendo
        const goingDown1 =
          this.peakConfirmationBuffer[len - 1] < this.peakConfirmationBuffer[len - 2];
        const goingDown2 =
          this.peakConfirmationBuffer[len - 2] < this.peakConfirmationBuffer[len - 3];

        if (goingDown1 && goingDown2) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      // Si ya no hay pico, liberamos la posibilidad de confirmar en el futuro
      this.lastConfirmedPeak = false;
    }

    return false;
  }

  // ────────── CÁLCULO DEL BPM ──────────

  /**
   * updateBPM
   * Si se confirma un pico, calcula la diferencia de tiempo
   * respecto del pico anterior y obtiene un "BPM instantáneo".
   */
  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;

    const instantBPM = 60000 / interval;
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 12) {
        this.bpmHistory.shift();
      }
    }
  }

  /**
   * getSmoothBPM
   * Devuelve un BPM promediado con EMA para evitar saltos bruscos.
   */
  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    this.smoothBPM =
      this.BPM_ALPHA * rawBPM + (1 - this.BPM_ALPHA) * this.smoothBPM;
    return this.smoothBPM;
  }

  /**
   * calculateCurrentBPM
   * Promedia la historia de BPM (descarta el valor más bajo y más alto),
   * para mitigar outliers.
   */
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    // Quitar el mínimo y el máximo
    const trimmed = sorted.slice(1, -1);
    if (!trimmed.length) return 0;
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  /**
   * getFinalBPM
   * Cálculo final del BPM tras finalizar la lectura,
   * recorta el 10% inferior y superior de la historia.
   */
  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.1);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    if (!finalSet.length) return 0;
    const sum = finalSet.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / finalSet.length);
  }

  // ────────── RESET COMPLETO ──────────

  /**
   * reset
   * Reinicia todo el sistema: tanto la detección de picos como la
   * lógica de arrhythmias. Úsalo si vas a comenzar una nueva medición.
   */
  public reset() {
    // Limpieza de buffers de señal
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
    this.values = [];

    // Limpieza de picos
    this.smoothBPM = 0;
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.lastBeepTime = 0;

    // Baseline y EMA
    this.baseline = 0;
    this.lastValue = 0;
    this.smoothedValue = 0;

    // Tiempos
    this.startTime = Date.now();
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.lowSignalCount = 0;

    // Arritmias
    this.rhythmLearningIntervals = [];
    this.lastRhythmTime = null;
    this.isLearningPhase = true;
    this.baselineRhythm = 0;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
  }

  // ────────── DETECCIÓN DE ARRITMIAS ──────────

  /**
   * analyzeRhythm
   * Llamado cada vez que se confirma un pico (latido). Mide la diferencia
   * en ms respecto al latido anterior para ver si hay una desviación anómala.
   */
  private analyzeRhythm(currentTime: number) {
    if (!this.lastRhythmTime) {
      // Primer latido en la medición, nada que comparar todavía.
      this.lastRhythmTime = currentTime;
      return;
    }

    const interval = currentTime - this.lastRhythmTime;
    const timeSinceStart = currentTime - this.measurementStartTime;

    // Mientras estemos en la fase de aprendizaje (primeros 10s):
    if (this.isLearningPhase && timeSinceStart <= this.LEARNING_PERIOD_MS) {
      this.rhythmLearningIntervals.push(interval);

      // Si excedimos los 10s, calculamos la línea base
      if (timeSinceStart > this.LEARNING_PERIOD_MS) {
        this.isLearningPhase = false;
        this.calculateBaselineRhythm();
      }
    }
    // Fase de detección (ya tenemos baselineRhythm)
    else if (!this.isLearningPhase && this.baselineRhythm > 0) {
      // Desviación porcentual respecto a la línea base
      const deviation = Math.abs(interval - this.baselineRhythm) / this.baselineRhythm;

      if (deviation > this.RHYTHM_TOLERANCE) {
        // Sumar 1 a la cuenta de arritmias
        this.arrhythmiaCount++;
        console.warn("HeartBeatProcessor - ARRITMIA DETECTADA", {
          interval,
          baselineRhythm: this.baselineRhythm,
          deviation,
          arrhythmiaCount: this.arrhythmiaCount,
          timestamp: new Date().toISOString()
        });
      }
    }

    this.lastRhythmTime = currentTime; // Actualizar para el siguiente latido
  }

  /**
   * calculateBaselineRhythm
   * Al terminar la fase de aprendizaje, descarta outliers (10% superior/inferior)
   * y promedia el resto para definir baselineRhythm.
   */
  private calculateBaselineRhythm() {
    if (this.rhythmLearningIntervals.length < 5) {
      console.log("HeartBeatProcessor - Baseline: Insuficientes intervalos para calcular", {
        required: 5,
        current: this.rhythmLearningIntervals.length
      });
      return;
    }

    const sorted = [...this.rhythmLearningIntervals].sort((a, b) => a - b);
    const cutoff = Math.floor(sorted.length * 0.1);
    const filtered = sorted.slice(cutoff, sorted.length - cutoff);

    this.baselineRhythm = filtered.reduce((sum, val) => sum + val, 0) / filtered.length;
    console.log("HeartBeatProcessor - Baseline Rhythm calculado", {
      baselineRhythm: this.baselineRhythm,
      intervalsCount: this.rhythmLearningIntervals.length,
      intervalsFiltered: filtered.length,
      toleranceMs: this.baselineRhythm * this.RHYTHM_TOLERANCE
    });
  }
}
