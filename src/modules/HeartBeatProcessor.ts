
export class HeartBeatProcessor {
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_PEAK_DISTANCE = 9;  // Ajustado de 10 a 9 para permitir hasta 190 BPM
  private readonly MAX_BPM = 190;
  private readonly MIN_BPM = 40;
  private readonly BEEP_FREQUENCY = 1000;
  private readonly BEEP_DURATION = 50;
  private readonly SIGNAL_THRESHOLD = 0.45;  // Ajustado a un punto medio entre 0.4 y 0.5
  private readonly MIN_CONFIDENCE = 0.80;
  private readonly DERIVATIVE_THRESHOLD = -0.045;  // Ajustado para exigir una bajada más pronunciada
  private readonly MIN_PEAK_TIME_MS = 315;  // Ajustado de 400 a 315 para permitir hasta 190 BPM
  private readonly WARMUP_TIME_MS = 5000;  // Tiempo de calentamiento de 5 segundos
  private readonly MOVING_AVERAGE_WINDOW = 5;  // Ventana para el promedio móvil
  private readonly EMA_ALPHA = 0.2;  // Factor de suavizado exponencial

  private signalBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private audioContext: AudioContext | null = null;
  private bpmHistory: number[] = [];
  private lastBeepTime: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private startTime: number = 0;
  private smoothedValue: number = 0;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio initialized successfully", {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    return this.movingAverageBuffer.reduce((a, b) => a + b, 0) / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }

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

  processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
  } {
    // Aplicar filtros para suavizar la señal
    const movingAvg = this.calculateMovingAverage(value);
    const smoothedValue = this.calculateEMA(movingAvg);

    this.signalBuffer.push(smoothedValue);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    if (this.signalBuffer.length < 30) {
      return { bpm: 0, confidence: 0, isPeak: false };
    }

    this.baseline = this.baseline * 0.98 + smoothedValue * 0.02;
    const normalizedValue = smoothedValue - this.baseline;

    this.values.push(smoothedValue);
    if (this.values.length > 3) this.values.shift();

    const smoothDerivative = this.values.length > 2 ? 
      (this.values[2] - this.values[0]) / 2 : 
      smoothedValue - this.lastValue;

    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    this.lastValue = smoothedValue;

    // No procesar picos durante el warmup
    if (isPeak && confidence > this.MIN_CONFIDENCE && !this.isInWarmup()) {
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
      isPeak: isPeak && !this.isInWarmup()
    };
  }

  private detectPeak(normalizedValue: number, derivative: number): { isPeak: boolean; confidence: number } {
    const currentTime = Date.now();
    const timeSinceLastPeak = this.lastPeakTime ? currentTime - this.lastPeakTime : Infinity;
    
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    const isPeak = derivative < this.DERIVATIVE_THRESHOLD && 
                   normalizedValue > this.SIGNAL_THRESHOLD &&
                   this.lastValue > this.baseline;

    const amplitudeConfidence = Math.min(Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 2), 0), 1);
    const derivativeConfidence = Math.min(Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD), 0), 1);
    const confidence = (amplitudeConfidence + derivativeConfidence) / 2;

    return { isPeak, confidence };
  }

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

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 2) {
      return 0;
    }

    // Eliminar valores extremos
    const sortedBPMs = [...this.bpmHistory].sort((a, b) => a - b);
    const filteredBPMs = sortedBPMs.slice(1, -1); // Elimina el valor más alto y más bajo

    if (filteredBPMs.length === 0) {
      return 0;
    }

    const average = filteredBPMs.reduce((a, b) => a + b, 0) / filteredBPMs.length;
    return Math.round(average);
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) return 0;

    // Descartar outliers (10% superior e inferior)
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const cut = Math.round(sorted.length * 0.1);
    const trimmed = sorted.slice(cut, sorted.length - cut);

    if (trimmed.length === 0) return 0;

    const sum = trimmed.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / trimmed.length);
  }

  reset() {
    this.signalBuffer = [];
    this.movingAverageBuffer = [];
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.bpmHistory = [];
    this.lastBeepTime = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.values = [];
    this.smoothedValue = 0;
    this.startTime = Date.now(); // Reiniciar el tiempo de calentamiento
  }
}
