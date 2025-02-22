export class HeartBeatProcessor {
  // Constantes de configuración
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_PEAK_DISTANCE = 9;    // Permite hasta ~190 BPM
  private readonly MAX_BPM = 190;
  private readonly MIN_BPM = 40;

  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;

  // Ajustes de detección
  private readonly SIGNAL_THRESHOLD = 0.45;  // Umbral de amplitud
  private readonly MIN_CONFIDENCE = 0.80;    // Confianza mínima para validar pico
  private readonly DERIVATIVE_THRESHOLD = -0.045; // Pendiente requerida para pico
  private readonly MIN_PEAK_TIME_MS = 315;   // Tiempo mínimo entre picos
  private readonly WARMUP_TIME_MS = 5000;    // Ignora picos en primeros 5s

  // Filtros
  private readonly MOVING_AVERAGE_WINDOW = 5;   // Ventana para promedio móvil
  private readonly MEDIAN_FILTER_WINDOW = 3;    // Ventana para mediana
  private readonly EMA_ALPHA = 0.2;             // Filtro exponencial

  // Variables de procesamiento
  private signalBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;

  // Variables para baseline, derivadas, etc.
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private smoothedValue: number = 0;
  private startTime: number = 0;

  // Para confirmar pico (evita falsos positivos)
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  // Inicializar audio (para beep)
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

  // Revisa si está en periodo de calentamiento
  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  // Filtro de mediana para reducir impulsos espurios en la señal
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

  // Filtro exponencial
  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

  // Emite un beep breve
  private async playBeep(volume: number = 0.1) {
    if (!this.audioContext || this.isInWarmup()) {
      return;
    }
    const currentTime = Date.now();
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

  // Llamar en cada frame o muestra
  public processSignal(value: number): { bpm: number; confidence: number; isPeak: boolean } {
    // Filtro de mediana
    const medianVal = this.medianFilter(value);
    // Promedio móvil
    const movingAvg = this.calculateMovingAverage(medianVal);
    // Filtro exponencial
    const smoothedValue = this.calculateEMA(movingAvg);

    // Mantenemos un buffer para la señal
    this.signalBuffer.push(smoothedValue);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Dejar acumular ~1s antes de calcular
    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    // Baseline menos agresivo (0.995 vs 0.98)
    this.baseline = this.baseline * 0.995 + smoothedValue * 0.005;
    const normalizedValue = smoothedValue - this.baseline;

    // Calcular derivada suave
    this.values.push(smoothedValue);
    if (this.values.length > 3) this.values.shift();
    const smoothDerivative = this.values.length > 2
      ? (this.values[2] - this.values[0]) / 2
      : smoothedValue - this.lastValue;

    // Detectar pico
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    this.lastValue = smoothedValue;

    // Confirmación de pico (evitamos falsos positivos)
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Actualizar BPM y reproducir beep solo si hay pico confirmado y no está en warm-up
    if (isConfirmedPeak && !this.isInWarmup()) {
      const currentTime = Date.now();
      const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Infinity;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = currentTime;
        this.playBeep(0.1);
        this.updateBPM();
      }
    }

    return {
      bpm: this.calculateCurrentBPM(),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup()
    };
  }

  // Verifica si el pico actual es real, usando su amplitud, pendiente, etc.
  private detectPeak(normalizedValue: number, derivative: number): { isPeak: boolean; confidence: number } {
    const currentTime = Date.now();
    const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Infinity;

    // Evitar detección si aún no pasa el tiempo mínimo entre picos
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    const isPeak = derivative < this.DERIVATIVE_THRESHOLD &&
                   normalizedValue > this.SIGNAL_THRESHOLD &&
                   this.lastValue > this.baseline;

    // Calcular confianza combinando amplitud y derivada
    const amplitudeConfidence = Math.min(Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 2), 0), 1);
    const derivativeConfidence = Math.min(Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD), 0), 1);
    const confidence = (amplitudeConfidence + derivativeConfidence) / 2;

    return { isPeak, confidence };
  }

  // Manejamos una pequeña ventana para verificar que haya un descenso tras el pico
  private confirmPeak(isPeak: boolean, normalizedValue: number, confidence: number): boolean {
    // Buffer para ver la evolución de la señal
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 4) {
      this.peakConfirmationBuffer.shift();
    }

    // Si vemos un pico y es la primera vez
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      // Analizar si en samples posteriores se ve tendencia a la baja
      // (peakConfirmationBuffer[x+1] < peakConfirmationBuffer[x], etc.)
      // Para simplificar, solo checamos si el último es menor que el penúltimo
      if (this.peakConfirmationBuffer.length >= 2) {
        const len = this.peakConfirmationBuffer.length;
        const goingDown = this.peakConfirmationBuffer[len - 1] < this.peakConfirmationBuffer[len - 2];
        if (goingDown) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      // Si no hay pico, permitimos volver a confirmar en el siguiente
      this.lastConfirmedPeak = false;
    }

    return false;
  }

  // Calcular BPM instantáneo
  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) {
      return;
    }
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) {
      return;
    }
    const instantBPM = 60000 / interval;
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 8) {
        this.bpmHistory.shift();
      }
    }
  }

  // Suavizar BPM actual (promedio sin outliers)
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    const filteredBPMs = sortedBPMs.slice(1, -1);
    if (filteredBPMs.length === 0) {
      return 0;
    }
    const average = filteredBPMs.reduce((a, b) => a + b, 0) / filteredBPMs.length;
    return Math.round(average);
  }

  // Obtener BPM final al terminar medición
  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) return 0;
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.1);
    const trimmed = sorted.slice(cut, sorted.length - cut);
    if (trimmed.length === 0) return 0;
    const sum = trimmed.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / trimmed.length);
  }

  // Para resetear toda la lógica (reiniciar medición)
  public reset() {
    this.signalBuffer = [];
    this.movingAverageBuffer = [];
    this.medianBuffer = [];
    this.bpmHistory = [];
    this.peakConfirmationBuffer = [];
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.values = [];
    this.smoothedValue = 0;
    this.startTime = Date.now();
  }
}
