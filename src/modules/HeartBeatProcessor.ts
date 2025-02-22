export class HeartBeatProcessor {
  // ========== CONFIGURACIONES PRINCIPALES ==========

  private readonly SAMPLE_RATE = 30;          // FPS o samples/s
  private readonly WINDOW_SIZE = 60;          // Buffer de señal (2s aprox. a 30 FPS)
  private readonly MIN_PEAK_DISTANCE = 9;     // Permite hasta ~190 BPM
  private readonly MAX_BPM = 190;
  private readonly MIN_BPM = 40;

  // Detección picos
  private readonly SIGNAL_THRESHOLD = 0.40;   // Umbral de amplitud (bajado de 0.45 -> 0.40)
  private readonly MIN_CONFIDENCE = 0.75;     // Confianza mínima (bajado de 0.80 -> 0.75)
  private readonly DERIVATIVE_THRESHOLD = -0.055; // Pendiente requerida (algo más demandante que -0.045)
  private readonly MIN_PEAK_TIME_MS = 315;    // Tiempo mínimo entre picos (~190 BPM máx)
  private readonly WARMUP_TIME_MS = 5000;     // Ignora detecciones en primeros 5s

  // Filtros
  private readonly MOVING_AVERAGE_WINDOW = 5; // Ventana para promedio móvil
  private readonly MEDIAN_FILTER_WINDOW = 3;  // Ventana para la mediana
  private readonly EMA_ALPHA = 0.2;           // Filtro exponencial

  // Sonido beep
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;

  // ========== VARIABLES DE PROCESAMIENTO ==========

  private signalBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private medianBuffer: number[] = [];

  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;

  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private smoothedValue: number = 0;
  private startTime: number = 0;

  // Para confirmar pico (doble chequeo)
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  // Variable para suavizar BPM en tiempo real (opcional)
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.3; // Cuanto mayor sea, más rápido reacciona el bpm en tiempo real

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  // ========== AUDIO PARA BEEP ==========

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      // Pequeño beep de prueba (volumen ínfimo)
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio initialized", {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext || this.isInWarmup()) {
      return;
    }
    const currentTime = Date.now();
    // Evitamos beep muy seguido (200 ms)
    if (currentTime - this.lastBeepTime < 200) {
      return;
    }
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(this.BEEP_FREQUENCY, this.audioContext.currentTime);

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.05);

      this.lastBeepTime = currentTime;
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
    }
  }

  // ========== FUNCIONES DE FILTRO ==========

  // Verifica si está en warm-up (se ignoran latidos en los primeros 5 s)
  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  // Filtro de mediana para reducir outliers bruscos
  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // Promedio móvil
  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }

  // Filtro exponencial (EMA)
  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  // ========== PROCESAR SEÑAL POR MUESTRA ==========

  public processSignal(value: number): { bpm: number; confidence: number; isPeak: boolean } {
    // 1) Filtro de mediana
    const medianVal = this.medianFilter(value);

    // 2) Promedio móvil
    const movingAvg = this.calculateMovingAverage(medianVal);

    // 3) Filtro exponencial
    const smoothedValue = this.calculateEMA(movingAvg);

    // Buffer de señal
    this.signalBuffer.push(smoothedValue);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Dejar acumular ~1s antes de procesar
    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    // Baseline menos agresivo (0.995) para no aplanar picos reales
    this.baseline = this.baseline * 0.995 + smoothedValue * 0.005;
    const normalizedValue = smoothedValue - this.baseline;

    // Calcular derivada suave
    this.values.push(smoothedValue);
    if (this.values.length > 3) this.values.shift();
    const smoothDerivative = this.values.length > 2
      ? (this.values[2] - this.values[0]) / 2
      : smoothedValue - this.lastValue;

    this.lastValue = smoothedValue;

    // Detectar pico (thresholds, pendiente, etc.)
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);

    // Confirmación de pico (ventana)
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Actualizar BPM y beep si hay pico confirmado
    if (isConfirmedPeak && !this.isInWarmup()) {
      const currentTime = Date.now();
      const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = currentTime;

        // Reproducir beep
        this.playBeep(0.1);

        // Guardar instantBPM
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()), // BPM suavizado en tiempo real
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup()
    };
  }

  private detectPeak(normalizedValue: number, derivative: number): { isPeak: boolean; confidence: number } {
    const currentTime = Date.now();
    const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Number.MAX_VALUE;

    // Evitar detección si no pasa el tiempo mínimo entre picos
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    const isPeak = derivative < this.DERIVATIVE_THRESHOLD &&
                   normalizedValue > this.SIGNAL_THRESHOLD &&
                   this.lastValue > this.baseline;

    // Confianza: combina amplitud y pendiente
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

    // Doble chequeo: si isPeak=true, ver si la siguiente muestra es menor (descenso)
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 2) {
        const len = this.peakConfirmationBuffer.length;
        const goingDown = this.peakConfirmationBuffer[len - 1] < this.peakConfirmationBuffer[len - 2];
        if (goingDown) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }
    return false;
  }

  // Guarda BPM en historia y recorta si excede 10 muestras
  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;

    const instantBPM = 60000 / interval;
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 10) {
        this.bpmHistory.shift();
      }
    }
  }

  // Suaviza BPM actual con un pequeño EMA
  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      // Iniciar
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    this.smoothBPM = this.BPM_ALPHA * rawBPM + (1 - this.BPM_ALPHA) * this.smoothBPM;
    return this.smoothBPM;
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }

    // Ordenar y descartar extremos
    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    const trimmed = sortedBPMs.slice(1, -1);
    if (trimmed.length === 0) {
      return 0;
    }

    const average = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return average;
  }

  // Devuelve BPM final tras la medición (descarta outliers)
  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) return 0;

    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.1);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    if (finalSet.length === 0) return 0;

    const sum = finalSet.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / finalSet.length);
  }

  // Resetea la lógica para empezar medición desde cero
  public reset() {
    this.signalBuffer = [];
    this.movingAverageBuffer = [];
    this.medianBuffer = [];
    this.values = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
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
