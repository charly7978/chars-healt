export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  
  // CALIBRACIÓN MEJORADA: Ajustados umbrales para detección más precisa
  private readonly SIGNAL_THRESHOLD = 0.40;   // Reducido para mayor sensibilidad
  private readonly MIN_CONFIDENCE = 0.60;     // Reducido para detectar latidos más sutiles
  private readonly DERIVATIVE_THRESHOLD = 0.035; // Ajustado para mejor detección de pendiente 
  
  private readonly MIN_PEAK_TIME_MS = 400; 
  private readonly WARMUP_TIME_MS = 3000; 

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 5; // Increased from 3 to reduce noise
  private readonly EMA_ALPHA = 0.4; 
  private readonly BASELINE_FACTOR = 1.0; 

  // Parámetros de beep
  private readonly BEEP_PRIMARY_FREQUENCY = 880; 
  private readonly BEEP_SECONDARY_FREQUENCY = 440; 
  private readonly BEEP_DURATION = 80; 
  private readonly BEEP_VOLUME = 0.9; 
  private readonly MIN_BEEP_INTERVAL_MS = 300;

  // ────────── AUTO-RESET SI LA SEÑAL ES MUY BAJA ──────────
  private readonly LOW_SIGNAL_THRESHOLD = 0.03;
  private readonly LOW_SIGNAL_FRAMES = 10;
  private lowSignalCount = 0;

  // Variables internas
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private smoothedValue: number = 0;
  private audioContext: AudioContext | null = null;
  private lastBeepTime = 0;
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private bpmHistory: number[] = [];
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private startTime: number = 0;
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2;
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;
  
  // NUEVO: Para calibración mejorada de picos
  private derivativeBuffer: number[] = [];
  private readonly DERIVATIVE_BUFFER_SIZE = 5;
  private isRisingEdge: boolean = false;
  private risingEdgeStartTime: number = 0;
  private peakAmplitudes: number[] = [];
  private readonly MAX_AMPLITUDE_HISTORY = 20;
  private averagePeakHeight: number = 0;
  private readonly PEAK_HEIGHT_SMOOTHING = 0.3;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio Context Initialized");
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext || this.isInWarmup()) return;

    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;

    try {
      const primaryOscillator = this.audioContext.createOscillator();
      const primaryGain = this.audioContext.createGain();

      const secondaryOscillator = this.audioContext.createOscillator();
      const secondaryGain = this.audioContext.createGain();

      primaryOscillator.type = "sine";
      primaryOscillator.frequency.setValueAtTime(
        this.BEEP_PRIMARY_FREQUENCY,
        this.audioContext.currentTime
      );

      secondaryOscillator.type = "sine";
      secondaryOscillator.frequency.setValueAtTime(
        this.BEEP_SECONDARY_FREQUENCY,
        this.audioContext.currentTime
      );

      // Envelope del sonido principal
      primaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      primaryGain.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + 0.01
      );
      primaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );

      // Envelope del sonido secundario
      secondaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      secondaryGain.gain.linearRampToValueAtTime(
        volume * 0.3,
        this.audioContext.currentTime + 0.01
      );
      secondaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );

      primaryOscillator.connect(primaryGain);
      secondaryOscillator.connect(secondaryGain);
      primaryGain.connect(this.audioContext.destination);
      secondaryGain.connect(this.audioContext.destination);

      primaryOscillator.start();
      secondaryOscillator.start();

      primaryOscillator.stop(this.audioContext.currentTime + this.BEEP_DURATION / 1000 + 0.05);
      secondaryOscillator.stop(this.audioContext.currentTime + this.BEEP_DURATION / 1000 + 0.05);

      this.lastBeepTime = now;
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
    }
  }

  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }

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

  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
  } {
    // Filtros sucesivos para mejorar la señal
    const medVal = this.medianFilter(value);
    const movAvgVal = this.calculateMovingAverage(medVal);
    const smoothed = this.calculateEMA(movAvgVal);

    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }

    if (this.signalBuffer.length < 30) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }

    // Ajustar línea base de forma dinámica para mejor adaptación
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    // Calcular derivada (tasa de cambio)
    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;
    
    // Almacenar derivada para análisis
    this.derivativeBuffer.push(smoothDerivative);
    if (this.derivativeBuffer.length > this.DERIVATIVE_BUFFER_SIZE) {
      this.derivativeBuffer.shift();
    }

    // CALIBRACIÓN MEJORADA: Detector de picos con mejor fase de subida
    const { isPeak, confidence, isRisingEdge } = this.detectPeak(normalizedValue, smoothDerivative);
    
    // Seguimiento de fase ascendente para ajustar el sonido adecuadamente
    if (isRisingEdge && !this.isRisingEdge) {
      this.isRisingEdge = true;
      this.risingEdgeStartTime = Date.now();
    } else if (!isRisingEdge && this.isRisingEdge) {
      this.isRisingEdge = false;
    }
    
    // Reproducir beep en fase ascendente con umbral de tiempo apropiado
    const now = Date.now();
    const timeSinceLastBeep = now - this.lastBeepTime;
    
    // El sonido debe ocurrir cuando la señal está claramente subiendo (pendiente positiva)
    // y ha pasado suficiente tiempo desde el último beep
    if (this.isRisingEdge && 
        confidence > this.MIN_CONFIDENCE && 
        !this.isInWarmup() && 
        timeSinceLastBeep >= this.MIN_BEEP_INTERVAL_MS &&
        this.derivativeBuffer.length > 0 && 
        this.derivativeBuffer[this.derivativeBuffer.length - 1] > 0) {
      
      this.playBeep(0.12 * confidence);
    }
    
    // Confirmación de picos para cálculo de BPM
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    // Tracking de picos para datos fisiológicos
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Almacenar amplitud del pico confirmado
        const currentPeakHeight = Math.abs(normalizedValue);
        this.peakAmplitudes.push(currentPeakHeight);
        if (this.peakAmplitudes.length > this.MAX_AMPLITUDE_HISTORY) {
          this.peakAmplitudes.shift();
        }
        
        // Ajustar altura promedio para calibración dinámica
        if (this.averagePeakHeight === 0) {
          this.averagePeakHeight = currentPeakHeight;
        } else {
          this.averagePeakHeight = this.averagePeakHeight * (1 - this.PEAK_HEIGHT_SMOOTHING) + 
                                 currentPeakHeight * this.PEAK_HEIGHT_SMOOTHING;
        }
        
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed,
      arrhythmiaCount: 0
    };
  }

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

  private resetDetectionStates() {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    this.derivativeBuffer = [];
    this.isRisingEdge = false;
    this.peakAmplitudes = [];
    console.log("HeartBeatProcessor: auto-reset detection states (low signal).");
  }

  // CALIBRACIÓN MEJORADA: Mejor detección de subida y picos
  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
    isRisingEdge: boolean;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;

    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0, isRisingEdge: false };
    }

    // CALIBRADO: Detectar fase ascendente con más precisión
    // - Se requiere derivada positiva (señal subiendo)
    // - Un valor ya por encima del umbral mínimo pero no demasiado alto
    const isRisingEdge = 
      derivative > this.DERIVATIVE_THRESHOLD && 
      normalizedValue > this.SIGNAL_THRESHOLD * 0.4 && 
      normalizedValue < this.SIGNAL_THRESHOLD * 2.0;
    
    // CALIBRADO: Detección ajustada de picos para mejor visualización
    const isPeakCandidate = 
      derivative < -0.01 &&  // Buscar cambio de dirección (cima)
      normalizedValue > this.SIGNAL_THRESHOLD && 
      this.lastValue > this.baseline * 0.95; // Permitir picos un poco más cercanos a la línea base

    // Confianza ajustada para mejores resultados visuales
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.3), 0),
      1
    );
    
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.8), 0),
      1
    );

    // Confianza adaptativa basada en historial de picos
    const confidenceBase = (amplitudeConfidence * 0.7 + derivativeConfidence * 0.3);
    
    // Mejorar confianza si el pico tiene amplitud consistente con picos anteriores
    let confidence = confidenceBase;
    if (this.averagePeakHeight > 0 && normalizedValue > 0) {
      const heightRatio = normalizedValue / this.averagePeakHeight;
      if (heightRatio > 0.7 && heightRatio < 1.3) {
        // Bonificación para picos que tienen altura similar a picos anteriores
        confidence = Math.min(1.0, confidence * 1.2);
      }
    }

    return { 
      isPeak: isPeakCandidate, 
      confidence, 
      isRisingEdge 
    };
  }

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
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    if (!trimmed.length) return 0;
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

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
    this.derivativeBuffer = [];
    this.isRisingEdge = false;
    this.peakAmplitudes = [];
    this.averagePeakHeight = 0;
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] } {
    return {
      intervals: this.bpmHistory.map(bpm => Math.round(60000 / bpm)), // Convertir BPM a intervalos RR en ms
      lastPeakTime: this.lastPeakTime,
      amplitudes: this.peakAmplitudes  // Pasar amplitudes reales de los picos
    };
  }
}
