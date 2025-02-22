/**
 * HeartBeatProcessor
 *
 * Procesa la señal PPG para estimar la frecuencia cardíaca y emite un beep
 * cada vez que detecta un latido real (pico de la onda).
 *
 * Ajustes clave para reducir falsos positivos y sincronizar mejor el beep
 * con el pico real de la onda:
 *
 *  1) Mayor verificación del pico (triple chequeo "goingDown" tras el posible pico).
 *  2) "PeakCandidate": se guarda el índice y amplitud cuando se sospecha un pico,
 *     pero se confirma 2-3 muestras después para ver si realmente empezó a descender.
 *  3) Umbral de confianza más alto (MIN_CONFIDENCE=0.80).
 *  4) MIN_PEAK_TIME_MS = 350 para limitar BPM a <= ~171 y así evitar picos muy seguidos.
 *  5) Ajuste en el beep: se emite justo cuando se confirma el pico (unos frames después
 *     del "tope" real), pero corresponde realmente al máximo de la onda.
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

  // Parámetros de detección.
  private readonly SIGNAL_THRESHOLD = 0.45;    // Mínimo de amplitud para considerar pico
  private readonly MIN_CONFIDENCE = 0.80;      // Confianza mínima (algo más estricta)
  private readonly DERIVATIVE_THRESHOLD = -0.05; // Pendiente requerida
  private readonly MIN_PEAK_TIME_MS = 350;     // Tiempo mínimo entre picos (~171 BPM máx)
  private readonly WARMUP_TIME_MS = 5000;      // Ignora detecciones en primeros 5s

  // Parámetros de filtrado.
  private readonly MEDIAN_FILTER_WINDOW = 5;   // Ventana mediana
  private readonly MOVING_AVERAGE_WINDOW = 7;  // Ventana promedio móvil
  private readonly EMA_ALPHA = 0.2;            // Filtro exponencial
  private readonly BASELINE_FACTOR = 0.998;    // Baseline muy sutil

  // Parámetros de beep.
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 60;
  private readonly MIN_BEEP_INTERVAL_MS = 300; // Evitar exceso de beeps

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

  // Confirmación de pico (triple verificación decir que de verdad bajó).
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  // Suavizado del BPM (EMA extra).
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2; // Cuanto menor, más suave el BPM

  // Para un "peak candidate".
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;  

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  // ────────── AUDIO PARA BEEP ──────────

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      // Beep de prueba mínimo
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

      // Fade in ~10ms, fade out ~50ms
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

  // ────────── UTILIDAD: PERIODO DE CALENTAMIENTO ──────────

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
   * confianza y si se detectó un pico real en esta muestra.
   */
  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
  } {
    // 1) Filtro de mediana
    const medVal = this.medianFilter(value);

    // 2) Promedio móvil
    const movAvgVal = this.calculateMovingAverage(medVal);

    // 3) Suavizado exponencial
    const smoothed = this.calculateEMA(movAvgVal);

    // Guardar en buffer para graficar
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Esperar ~1s para no detectar picos apenas inicia
    if (this.signalBuffer.length < 30) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed
      };
    }

    // Baseline muy suave
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    // Valor "normalizado" restando baseline
    const normalizedValue = smoothed - this.baseline;

    // Derivada "suave"
    this.values.push(smoothed);
    if (this.values.length > 3) this.values.shift();

    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;

    // Intento de pico
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);

    // Verificación final de pico
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Si se confirma y no hay warmUp, actualizamos BPM & beep
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      // Verificamos que sea un pico temporalmente válido
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        // Beep en el momento exacto de confirmación
        this.playBeep(0.12);
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed
    };
  }

  // ────────── DETECCIÓN / CONFIRMACIÓN DE PICO ──────────

  /**
   * detectPeak
   * Aplica criterios básicos para decidir si la muestra
   * puede ser un pico (derivada negativa + amplitud).
   * @returns { isPeak, confidence }
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

    // Criterios
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
    // Desplazamos la ventana de confirmación
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }

    // Comprobamos triple descenso tras el pico
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 3) {
        const len = this.peakConfirmationBuffer.length;
        // Nos fijamos que las últimas 3 muestras vayan decreciendo.
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
      // Si ya no hay pico, liberamos la posibilidad de confirmar luego
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
   * Devuelve un BPM suavizado con EMA para evitar saltos.
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
   * para mitigar los outliers.
   */
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    // Quitar mínimo y máximo
    const trimmed = sorted.slice(1, -1);
    if (!trimmed.length) return 0;
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  /**
   * getFinalBPM
   * Cálculo final del BPM tras terminar lectura,
   * recorta el 10% inferior/superior de la historia.
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

  // ────────── RESET ──────────

  public reset() {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
    this.values = [];

    this.smoothBPM = 0;
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.lastBeepTime = 0;

    this.baseline = 0;
    this.lastValue = 0;
    this.smoothedValue = 0;

    this.startTime = Date.now();
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
  }
}
