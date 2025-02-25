interface HeartBeatResult {
  bpm: number;
  confidence: number;
  isPeak: boolean;
  filteredValue: number;
  arrhythmiaCount: number;
  rrData?: {
    intervals: number[];
    lastPeakTime: number | null;
  };
}

export class HeartBeatProcessor {
  // Optimización de parámetros para mejor detección
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 90;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 220;
  private readonly MIN_CONFIDENCE = 0.2; // Reducido para mejor detección
  private readonly SIGNAL_THRESHOLD = 0.1; // Reducido para captar señales más débiles
  private readonly NOISE_THRESHOLD = 0.1;
  private readonly DERIVATIVE_THRESHOLD = -0.001; // Más sensible
  private readonly MIN_PEAK_TIME_MS = 250;
  private readonly WARMUP_TIME_MS = 1000; // Reducido para iniciar más rápido
  private readonly PEAK_AGE_WEIGHT = 0.8;
  private readonly BASELINE_ALPHA = 0.02;

  // Variables de estado
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private smoothedValue: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private lastPeakTime: number | null = null;
  private bpmHistory: number[] = [];
  private adaptiveThreshold: number = 0;
  private signalQuality: number = 0;

  constructor() {
    this.reset();
    console.log("HeartBeatProcessor: Inicializado con parámetros optimizados");
  }

  public async ensureAudioInitialized(): Promise<boolean> {
    try {
      const audioContext = new window.AudioContext();
      await audioContext.resume();
      return true;
    } catch (error) {
      console.error("Error initializing audio:", error);
      return false;
    }
  }

  public async requestManualBeep(): Promise<boolean> {
    try {
      const audioContext = new window.AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.07);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.08);
      
      return true;
    } catch (error) {
      console.error("Error playing beep:", error);
      return false;
    }
  }

  public getSignalQuality(): number {
    // Calculate signal quality based on recent measurements
    const recentValues = this.signalBuffer.slice(-10);
    if (recentValues.length === 0) return 0;
    
    const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const variance = recentValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentValues.length;
    
    return Math.max(0, Math.min(100, 100 * (1 - Math.sqrt(variance) / mean)));
  }

  public getFinalBPM(): number {
    return this.calculateCurrentBPM();
  }

  public processSignal(value: number): HeartBeatResult {
    // Evitar valores inválidos
    if (isNaN(value) || value === 0) {
      console.log("HeartBeatProcessor: Valor inválido recibido");
      return { bpm: 0, confidence: 0, isPeak: false, filteredValue: 0, arrhythmiaCount: 0 };
    }

    // Pipeline de procesamiento optimizado
    const medianFiltered = this.medianFilter(value);
    const movingAvg = this.calculateMovingAverage(medianFiltered);
    const smoothed = this.calculateEMA(movingAvg);

    // Almacenar para análisis
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    // Actualizar línea base adaptativa
    if (this.baseline === 0) {
      this.baseline = smoothed;
    } else {
      this.baseline = this.baseline * (1 - this.BASELINE_ALPHA) + smoothed * this.BASELINE_ALPHA;
    }

    // Normalizar señal
    const normalizedValue = smoothed - this.baseline;

    // Detectar picos
    const derivative = smoothed - this.lastValue;
    this.lastValue = smoothed;

    const { isPeak, confidence } = this.detectPeak(normalizedValue, derivative);

    // Procesar pico detectado
    if (isPeak && confidence > this.MIN_CONFIDENCE) {
      const now = Date.now();
      if (!this.lastPeakTime || (now - this.lastPeakTime) >= this.MIN_PEAK_TIME_MS) {
        this.lastPeakTime = now;
        this.updateBPM(now);
        console.log("HeartBeatProcessor: Pico detectado", {
          tiempo: now,
          bpm: this.calculateCurrentBPM(),
          confianza: confidence
        });
      }
    }

    return {
      bpm: Math.round(this.calculateCurrentBPM()),
      confidence,
      isPeak,
      filteredValue: smoothed,
      arrhythmiaCount: 0,
      rrData: {
        intervals: [],
        lastPeakTime: this.lastPeakTime
      }
    };
  }

  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > 5) {
      this.medianBuffer.shift();
    }
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > 3) {
      this.movingAverageBuffer.shift();
    }
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }

  private calculateEMA(value: number): number {
    this.smoothedValue = 0.3 * value + 0.7 * this.smoothedValue;
    return this.smoothedValue;
  }

  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    // Criterios simplificados para mejor detección
    const isOverThreshold = 
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline;

    // Calcular confianza
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.2), 0),
      1
    );

    return {
      isPeak: isOverThreshold,
      confidence: amplitudeConfidence
    };
  }

  private updateBPM(currentTime: number): void {
    if (!this.lastPeakTime) return;

    const interval = currentTime - this.lastPeakTime;
    if (interval <= 0) return;

    const instantBPM = 60000 / interval;
    
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 10) {
        this.bpmHistory.shift();
      }
      console.log("HeartBeatProcessor: BPM actualizado", instantBPM);
    }
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) return 0;
    
    const recentBPMs = this.bpmHistory.slice(-5);
    return recentBPMs.reduce((a, b) => a + b, 0) / recentBPMs.length;
  }

  public reset(): void {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.smoothedValue = 0;
    this.baseline = 0;
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.bpmHistory = [];
    this.adaptiveThreshold = 0;
    console.log("HeartBeatProcessor: Sistema reseteado");
  }
}
