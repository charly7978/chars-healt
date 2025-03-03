export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  
  // CALIBRACIÓN MEJORADA: Ajustados umbrales para detección más precisa
  private readonly SIGNAL_THRESHOLD = 0.35;   // Reducido para mayor sensibilidad
  private readonly MIN_CONFIDENCE = 0.55;     // Ajustado para mejor detección
  private readonly DERIVATIVE_THRESHOLD = 0.045; // Aumentado para mejor detección de pendiente 
  
  private readonly MIN_PEAK_TIME_MS = 400; 
  private readonly WARMUP_TIME_MS = 3000; 

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 4; // Increased from 3 to reduce noise
  private readonly EMA_ALPHA = 0.35; 
  private readonly BASELINE_FACTOR = 0.98; 

  // Parámetros de beep
  private readonly BEEP_PRIMARY_FREQUENCY = 880; 
  private readonly BEEP_SECONDARY_FREQUENCY = 440; 
  private readonly BEEP_DURATION = 80; 
  private readonly BEEP_VOLUME = 0.7; 
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

  // NUEVO: Parámetros para detección de respiración
  private readonly RESP_WINDOW_SIZE = 300;  // 10 segundos a 30fps
  private readonly RESP_MIN_AMPLITUDE = 0.1;
  private readonly RESP_FILTER_ALPHA = 0.15;
  
  // Buffers y estado
  private respirationBuffer: number[] = [];
  private lastPeakAmplitudes: number[] = [];
  
  constructor() {
    this.initAudio();
    this.startTime = Date.now();
    this.loadBeepSound();
  }

  private async initAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await this.audioContext.resume();
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio Context Initialized");
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async loadBeepSound() {
    try {
      const response = await fetch('https://raw.githubusercontent.com/medical-devices/sounds/main/cardiac-monitor-beep.mp3');
      const arrayBuffer = await response.arrayBuffer();
      if (this.audioContext) {
        this.beepBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      }
    } catch (error) {
      console.error('Error cargando sonido:', error);
      // Fallback a beep generado si falla la carga
      this.generateFallbackBeep();
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext || this.isInWarmup()) return;

    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;

    try {
      if (this.beepBuffer) {
        // Usar sonido cargado
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = this.beepBuffer;
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        source.start();
      } else {
        // Fallback a beep generado
        this.generateFallbackBeep();
      }
    } catch (error) {
      console.error('Error reproduciendo beep:', error);
    }
  }

  private generateFallbackBeep() {
    if (!this.audioContext) return;
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.BEEP_VOLUME, this.audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.08);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.08);
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
    respirationRate: number;
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

    // Actualizar buffer de respiración
    this.updateRespirationBuffer(smoothed);

    if (this.signalBuffer.length < 30) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        respirationRate: 0,
        arrhythmiaCount: 0
      };
    }

    this.baseline = this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);
    const normalizedValue = smoothed - this.baseline;
    
    // Verificar señal baja
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    // Detección mejorada de picos
    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    // Calcular derivada suavizada
    let derivative = 0;
    if (this.values.length === 3) {
      derivative = (this.values[2] - this.values[0]) / 2;
    }

    // Detección de picos mejorada
    const { isPeak, confidence, isRisingEdge } = this.detectPeak(normalizedValue, derivative);
    
    // Confirmación de picos más precisa
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);

    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Almacenar amplitud del pico
        this.lastPeakAmplitudes.push(Math.abs(normalizedValue));
        if (this.lastPeakAmplitudes.length > 10) {
          this.lastPeakAmplitudes.shift();
        }
        
        // Reproducir beep solo en picos confirmados
        this.playBeep(Math.min(1.0, Math.abs(normalizedValue) * 2));
        
        this.updateBPM();
      }
    }

    // Actualizar tasa respiratoria
    this.updateRespirationRate();

    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed,
      respirationRate: Math.round(this.respirationRate),
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
    // Mejorar detección de picos usando derivada y amplitud
    const isRising = derivative > this.DERIVATIVE_THRESHOLD;
    const isFalling = derivative < -this.DERIVATIVE_THRESHOLD;
    
    // Calcular umbral adaptativo basado en picos anteriores
    let adaptiveThreshold = this.SIGNAL_THRESHOLD;
    if (this.lastPeakAmplitudes.length > 0) {
      const avgPeakAmplitude = this.lastPeakAmplitudes.reduce((sum, amp) => sum + amp, 0) / 
                              this.lastPeakAmplitudes.length;
      adaptiveThreshold = avgPeakAmplitude * 0.6;
    }
    
    // Detectar pico cuando la señal cambia de subida a bajada
    const isPeak = normalizedValue > adaptiveThreshold && 
                  this.peakConfirmationBuffer.length >= this.PEAK_CONFIRMATION_WINDOW &&
                  isRising;
    
    // Calcular confianza basada en múltiples factores
    let confidence = 0;
    if (isPeak) {
      const amplitudeConfidence = Math.min(1, normalizedValue / (adaptiveThreshold * 2));
      const derivativeConfidence = Math.min(1, Math.abs(derivative) / (this.DERIVATIVE_THRESHOLD * 2));
      confidence = (amplitudeConfidence * 0.7 + derivativeConfidence * 0.3);
    }
    
    return {
      isPeak,
      confidence,
      isRisingEdge: isRising
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
    this.respirationBuffer = [];
    this.lastPeakAmplitudes = [];
  }

  public getRRIntervals(): { 
    intervals: number[]; 
    lastPeakTime: number | null; 
    amplitudes?: number[];
    respirationRate?: number;
  } {
    return {
      intervals: this.bpmHistory.map(bpm => Math.round(60000 / bpm)),
      lastPeakTime: this.lastPeakTime,
      amplitudes: this.lastPeakAmplitudes,
      respirationRate: this.respirationRate
    };
  }

  // NUEVO: Actualizar buffer de respiración
  private updateRespirationBuffer(value: number) {
    this.respirationBuffer.push(value);
    if (this.respirationBuffer.length > this.RESP_WINDOW_SIZE) {
      this.respirationBuffer.shift();
    }
    
    // Actualizar línea base de respiración
    if (this.respirationBuffer.length > 0) {
      const avg = this.respirationBuffer.reduce((sum, val) => sum + val, 0) / this.respirationBuffer.length;
      this.respBaseline = this.respBaseline * (1 - this.RESP_FILTER_ALPHA) + avg * this.RESP_FILTER_ALPHA;
    }
  }

  // NUEVO: Calcular tasa respiratoria
  private updateRespirationRate() {
    if (this.respirationBuffer.length < this.RESP_WINDOW_SIZE) return;
    
    // Detectar ciclos respiratorios usando análisis de cruce por cero
    let crossings = 0;
    let lastWasAbove = false;
    
    for (let i = 0; i < this.respirationBuffer.length; i++) {
      const value = this.respirationBuffer[i] - this.respBaseline;
      const isAbove = value > 0;
      
      if (i > 0 && isAbove !== lastWasAbove) {
        crossings++;
      }
      
      lastWasAbove = isAbove;
    }
    
    // Calcular tasa respiratoria (respiraciones por minuto)
    const windowDurationMinutes = this.RESP_WINDOW_SIZE / (this.SAMPLE_RATE * 60);
    const cycles = crossings / 2; // Cada ciclo completo tiene 2 cruces
    this.respirationRate = cycles / windowDurationMinutes;
    
    // Limitar a rango fisiológico (8-30 respiraciones por minuto)
    this.respirationRate = Math.max(8, Math.min(30, this.respirationRate));
  }
}
