/**
 * HeartBeatProcessor
 *
 * Procesa la señal PPG para estimar la frecuencia cardíaca y emite un beep
 * cada vez que el detector de picos (basado en la misma señal que se grafica)
 * identifica un pico real.
 *
 * Problema:
 *   - Cuando el usuario retira el dedo, la onda en el gráfico cae a ~0 (o muy baja),
 *     pero a veces continúa la detección de picos "residuales" y se oyen beeps
 *     ficticios.
 *
 * Solución:
 *   - Alineamos la lógica de beep con la misma señal filtrada que pintas en tu
 *     gráfico (la que "funciona perfectamente"). De modo que si la onda está
 *     realmente baja, no se detecta ningún pico y, por ende, no hay beep.
 *   - Agregamos una rutina de "autoResetIfSignalIsLow" que observa si la
 *     amplitud permanece muy baja durante unos cuantos frames. Si esto ocurre,
 *     se limpian las variables internas de detección de pico (peakConfirmation, etc.)
 *     para evitar que frames antiguos sigan originando beeps.
 *
 *   - De esta forma, NO forzamos ninguna lógica "finger detection" que impida
 *     el beep artificialmente. Simplemente, si la señal es cercana a cero por
 *     varios frames, reiniciamos el detector y evitamos picos rezagados.
 *
 * Ajustes clave en este código:
 *   1) autoResetIfSignalIsLow(...) en processSignal(...) antes de llamar a detectPeak(...).
 *      Revisa la amplitud absoluta del "normalizedValue".
 *   2) si esa amplitud < LOW_SIGNAL_THRESHOLD por >= LOW_SIGNAL_FRAMES consecutivos,
 *      se llama a resetDetectionStates(), que borra lastPeakTime, peak buffer, etc.
 *   3) El beep sigue disparándose con la condición de pico confirmada, pero ahora
 *      no arrastra la "inercia" de frames anteriores cuando el dedo se retira.
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
  private readonly SIGNAL_THRESHOLD = 0.45;       // Mínimo de amplitud para considerar pico
  private readonly MIN_CONFIDENCE = 0.80;         // Confianza mínima (algo estricta)
  private readonly DERIVATIVE_THRESHOLD = -0.05;  // Pendiente requerida
  private readonly MIN_PEAK_TIME_MS = 350;        // Tiempo mínimo entre picos (~171 BPM máx)
  private readonly WARMUP_TIME_MS = 5000;         // Ignora detecciones en primeros 5s

  // Parámetros de filtrado.
  private readonly MEDIAN_FILTER_WINDOW = 5;      // Ventana mediana
  private readonly MOVING_AVERAGE_WINDOW = 7;     // Ventana promedio móvil
  private readonly EMA_ALPHA = 0.2;               // Filtro exponencial
  private readonly BASELINE_FACTOR = 0.998;       // Baseline muy sutil

  // Parámetros de beep.
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 60;
  private readonly MIN_BEEP_INTERVAL_MS = 300;    // Evitar exceso de beeps

  // ────────── AUTO-RESET SI LA SEÑAL ES MUY BAJA ──────────
  /**
   * Para evitar que, al retirar el dedo (señal queda ~0), se sigan produciendo
   * beeps por picos pasados, reiniciamos el detector cuando la amplitud está
   * muy baja durante varios frames consecutivos.
   */
  private readonly LOW_SIGNAL_THRESHOLD = 0.03;   // Umbral de amplitud que consideramos "casi cero"
  private readonly LOW_SIGNAL_FRAMES = 10;        // Frames consecutivos bajos para reset

  private lowSignalCount = 0;                     // Contador de frames consecutivos con señal baja

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
  private readonly BPM_ALPHA = 0.2; // Cuanto menor, más suave el BPM

  // "Peak candidate" (solo si quisieras guardar índice/amplitud).
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
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

    // Guardar en buffer para graficar (por si lo necesitas)
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Evitar detecciones en primeros ~30 frames
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

    // Valor "normalizado"
    const normalizedValue = smoothed - this.baseline;

    // ——— Auto-reset si señal está muy baja varios frames ———
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

  /**
   * autoResetIfSignalIsLow
   * Si la señal permanece por debajo de LOW_SIGNAL_THRESHOLD
   * durante LOW_SIGNAL_FRAMES consecutivos, reset parcial de
   * las variables de detección de picos.
   */
  private autoResetIfSignalIsLow(amplitude: number) {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        // Hacemos un reset de la detección,
        // pero sin tocar la baseline ni la señal filtrada.
        this.resetDetectionStates();
      }
    } else {
      // Si la amplitud es suficientemente grande, reiniciamos el contador
      this.lowSignalCount = 0;
    }
  }

  /**
   * resetDetectionStates
   * Limpia las variables que afectan la detección de picos, 
   * para no arrastrar muestras antiguas cuando la señal se va a ~0.
   */
  private resetDetectionStates() {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    // No reiniciamos baseline ni smoothValue ni buffer general;
    // solo limpiamos las estructuras de pico.
    console.log("HeartBeatProcessor: auto-reset detection states (signal was too low).");
  }

  // ────────── DETECCIÓN / CONFIRMACIÓN DE PICO ──────────

  /**
   * detectPeak
   * Aplica criterios básicos para decidir si la muestra
   * puede ser un pico (derivada negativa + amplitud).
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
        // Miramos que las últimas 3 muestras vayan decreciendo
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
   * Devuelve un BPM suavizado con EMA para evitar saltos bruscos.
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

    this.lowSignalCount = 0;
  }
}
