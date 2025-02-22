/**
 * HeartBeatProcessor
 *
 * Procesa la señal PPG para estimar la frecuencia cardíaca.
 * Incluye:
 *   - Filtro de mediana para atenuar impulsos espurios.
 *   - Promedio móvil para suavizar la señal.
 *   - Filtro exponencial (EMA) para pulir aún más la curva.
 *   - Baseline lento para no aplanar picos verdaderos.
 *   - Detección de picos con doble verificación (pendiente + umbral + descenso).
 *   - Suavizado del BPM en tiempo real, y un cálculo final que descarta outliers.
 *
 * Ajustes adicionales para reducir falsos picos y valores irreales de BPM:
 *   1) Umbral de señal moderado y derivada no tan alta (-0.05).
 *   2) MIN_PEAK_TIME_MS un poco mayor (333 ms) para evitar detecciones en >180 BPM.
 *   3) Menor Sensibilidad en beep (tiempo mínimo 300 ms entre beeps).
 *   4) Ventanas de mediana y moving average medianamente amplias.
 */
export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────

  // Frecuencia de muestreo (~30 FPS).
  private readonly SAMPLE_RATE = 30;

  // Tamaño de buffer para graficar señal (2 s a 30 FPS).
  private readonly WINDOW_SIZE = 60;

  // Rango de picos plausibles.
  private readonly MAX_BPM = 180;  // Reducimos a 180 para evitar valores muy altos
  private readonly MIN_BPM = 40;

  // Parámetros de detección.
  private readonly SIGNAL_THRESHOLD = 0.45;    // Umbral de amplitud
  private readonly MIN_CONFIDENCE = 0.75;      // Confianza mínima
  private readonly DERIVATIVE_THRESHOLD = -0.05; // Pendiente requerida
  private readonly MIN_PEAK_TIME_MS = 333;     // Tiempo mínimo entre picos (~180 BPM)
  private readonly WARMUP_TIME_MS = 5000;      // Ignora detecciones en primeros 5 s

  // Parámetros de filtrado.
  private readonly MEDIAN_FILTER_WINDOW = 5;   // Ventana para mediana
  private readonly MOVING_AVERAGE_WINDOW = 7;  // Ventana para promedio móvil
  private readonly EMA_ALPHA = 0.2;            // Suavizado exponencial
  private readonly BASELINE_FACTOR = 0.998;    // Baseline muy poco agresivo

  // Sonido beep.
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 60;         // Un poco más largo
  private readonly MIN_BEEP_INTERVAL_MS = 300; // Tiempo mínimo entre beeps

  // ────────── VARIABLES DE PROCESAMIENTO ──────────

  // Buffers y estados de filtro.
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private smoothedValue: number = 0;  // Salida del EMA

  // Audio.
  private audioContext: AudioContext | null = null;
  private lastBeepTime = 0;

  // Para detección de picos y BPM.
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private bpmHistory: number[] = [];

  // Baseline & derivadas.
  private baseline: number = 0;
  private lastValue: number = 0;  // Para derivada
  private values: number[] = [];  // Ventana para derivada suave
  private startTime: number = 0;  // Para warm-up

  // Confirmación de pico (evitar falsos).
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  // Suavizado del BPM en tiempo real.
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2; // Cuanto menor, más suave el BPM

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  // ────────── AUDIO PARA BEEP ──────────

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
    // Evitamos beep muy seguido
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        this.BEEP_FREQUENCY,
        this.audioContext.currentTime
      );

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(
        0,
        this.audioContext.currentTime + 0.06
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

  // ────────── CONTROL DE TIEMPO (WARM-UP) ──────────

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  // ────────── FILTROS: MEDIANA, MÓVIL, EXPONENCIAL ──────────

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
   * 
   * @param value Valor crudo de la señal PPG (frame actual).
   * @returns { bpm, confidence, isPeak, filteredValue }  
   *  - bpm: BPM estimado y suavizado.  
   *  - confidence: qué tan "fuerte" es la detección del pico.  
   *  - isPeak: si se ha detectado un pico confirmado.  
   *  - filteredValue: la señal filtrada para graficar.
   */
  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
  } {
    // Paso 1: Filtro de mediana
    const medVal = this.medianFilter(value);

    // Paso 2: Promedio móvil
    const movAvgVal = this.calculateMovingAverage(medVal);

    // Paso 3: EMA
    const smoothed = this.calculateEMA(movAvgVal);

    // Guardamos para graficar
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Esperamos ~1s para tener datos suficientes (evita arranque errático).
    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false, filteredValue: smoothed };
    }

    // Baseline muy leve
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;

    // Derivada "suave"
    this.values.push(smoothed);
    if (this.values.length > 3) this.values.shift();
    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;

    // Detectar pico
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);

    // Confirmar pico real
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Actualizar BPM y beep si pico confirmado y no en warm-up
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
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

  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;

    // Asegurar tiempo mínimo entre picos
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Requisitos de pico
    const isPeak =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline;

    // Confianza: mezcla amplitud vs threshold y pendiente
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

  private confirmPeak(isPeak: boolean, normalizedValue: number, confidence: number): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 4) {
      this.peakConfirmationBuffer.shift();
    }

    // Doble verificación de descenso
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length > 2) {
        const len = this.peakConfirmationBuffer.length;
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
      this.lastConfirmedPeak = false;
    }
    return false;
  }

  // ────────── CÁLCULO DE BPM ──────────

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

  private calculateCurrentBPM(): number {
    // Necesitamos al menos 2 mediciones de BPM
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    // Descartar mínimo y máximo
    const trimmed = sorted.slice(1, -1);
    if (!trimmed.length) return 0;
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  // BPM final, recortando 10% inferior y superior para mitigar outliers
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
  }
}
