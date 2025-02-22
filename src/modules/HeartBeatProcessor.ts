export class HeartBeatProcessor {
  // ========== CONFIGURACIONES PRINCIPALES ==========

  private readonly SAMPLE_RATE = 30;            // FPS o samples/s
  private readonly WINDOW_SIZE = 60;            // Buffer de señal (~2s a 30 FPS)
  private readonly MIN_PEAK_DISTANCE = 9;       // Permite hasta ~190 BPM
  private readonly MAX_BPM = 190;
  private readonly MIN_BPM = 40;

  // Detección de picos
  private readonly SIGNAL_THRESHOLD = 0.42;     // Umbral de amplitud (ligeramente menor que 0.45)
  private readonly MIN_CONFIDENCE = 0.75;       // Confianza mínima
  private readonly DERIVATIVE_THRESHOLD = -0.06;// Pendiente requerida (un poco más estricta)
  private readonly MIN_PEAK_TIME_MS = 315;      // Tiempo mínimo entre picos (~190 BPM máx)
  private readonly WARMUP_TIME_MS = 5000;       // Ignora detecciones en los primeros 5s

  // Filtros
  private readonly MEDIAN_FILTER_WINDOW = 5;    // Ventana para el filtro de mediana (aumentada de 3 a 5)
  private readonly MOVING_AVERAGE_WINDOW = 7;   // Ventana para promedio móvil (para suavizar más)
  private readonly EMA_ALPHA = 0.2;             // Filtro exponencial
  
  // Ajuste de baseline (menos agresivo para no aplanar picos reales)
  private readonly BASELINE_FACTOR = 0.997;     // Usar 0.997 en lugar de 0.995

  // Sonido beep
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;

  // ========== VARIABLES DE PROCESAMIENTO ==========

  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];

  private audioContext: AudioContext | null = null;

  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;

  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private smoothedValue: number = 0;
  private startTime: number = 0;

  // Para confirmar pico (doble/triple chequeo de descenso)
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  // Suavizado del BPM en tiempo real
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2; // menor valor => más suave el BPM en tiempo real

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  // ========== AUDIO PARA BEEP ==========

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      // Pequeño beep de prueba con volumen ínfimo
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
    const now = Date.now();
    // Evitamos beep muy seguido (200 ms)
    if (now - this.lastBeepTime < 200) {
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

      this.lastBeepTime = now;
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
    }
  }

  // ========== CONTROL DE TIEMPOS ==========

  // Verifica si está en periodo de calentamiento
  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  // ========== FILTROS ==========

  // Filtro de mediana: reduce picos espurios y outliers
  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // Promedio móvil en ventana de 7 muestras
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
    // 1) Filtrado mediana
    const medianVal = this.medianFilter(value);

    // 2) Promedio móvil
    const movingAvg = this.calculateMovingAverage(medianVal);

    // 3) Filtro exponencial
    const smoothed = this.calculateEMA(movingAvg);

    // Buffer de señal (opcional para graficar)
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Esperar ~1s antes de intentar detectar picos
    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    // Actualizar baseline (menos agresivo)
    this.baseline = this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);
    const normalizedValue = smoothed - this.baseline;

    // Calcular derivada suave
    this.values.push(smoothed);
    if (this.values.length > 3) this.values.shift();
    const smoothDerivative = this.values.length > 2
      ? (this.values[2] - this.values[0]) / 2
      : smoothed - this.lastValue;

    this.lastValue = smoothed;

    // Detectar pico (criterios de threshold y pendiente)
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);

    // Confirmar pico real para evitar falsos latidos
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Actualizar BPM y beep si hay pico confirmado y no está en warmup
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime ? now - this.lastPeakTime : Number.MAX_VALUE;
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        this.playBeep(0.1);
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()), // BPM suavizado en tiempo real
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup()
    };
  }

  // Detectar si la señal actual es un pico potencial
  private detectPeak(normalizedValue: number, derivative: number): { isPeak: boolean; confidence: number } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime ? now - this.lastPeakTime : Number.MAX_VALUE;
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Criterios de pico
    const isPeak = 
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline;

    // Confianza: mezcla amplitud vs. threshold y magnitud de la pendiente
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

  // Comprueba si el pico detectado realmente desciende en las muestras posteriores
  private confirmPeak(isPeak: boolean, normalizedValue: number, confidence: number): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);

    // Mantenemos una ventana de 5 muestras
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }

    // Doble/triple verificación de descenso
    // Si isPeak = true y no habíamos confirmado antes...
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length > 2) {
        const len = this.peakConfirmationBuffer.length;
        // Revisamos si las 2 últimas muestras han bajado respecto al pico
        const goingDown1 = this.peakConfirmationBuffer[len - 1] < this.peakConfirmationBuffer[len - 2];
        const goingDown2 = this.peakConfirmationBuffer[len - 2] < this.peakConfirmationBuffer[len - 3];
        if (goingDown1 && goingDown2) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      // Si ya no es pico, permitimos volver a confirmar la próxima vez
      this.lastConfirmedPeak = false;
    }

    return false;
  }

  // ========== CÁLCULO DE BPM ==========

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

  // Suavizar BPM en tiempo real usando EMA adicional
  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      // Inicializar
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    this.smoothBPM =
      this.BPM_ALPHA * rawBPM + (1 - this.BPM_ALPHA) * this.smoothBPM;
    return this.smoothBPM;
  }

  // Promedio de la historia de BPM, descartando extremos
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    // Descartamos el valor más bajo y más alto (reduce outliers)
    const trimmed = sortedBPMs.slice(1, -1);
    if (trimmed.length === 0) {
      return 0;
    }
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  // Devuelve un BPM final tras la medición, recortando outliers
  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.1);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    if (finalSet.length === 0) return 0;
    const sum = finalSet.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / finalSet.length);
  }

  // Resetea todo para una nueva medición
  public reset() {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
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
