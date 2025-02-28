export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  private readonly SIGNAL_THRESHOLD = 0.40; 
  private readonly MIN_CONFIDENCE = 0.60;
  private readonly DERIVATIVE_THRESHOLD = -0.03; 
  private readonly MIN_PEAK_TIME_MS = 400; 
  private readonly WARMUP_TIME_MS = 3000; 

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 3; 
  private readonly EMA_ALPHA = 0.4; 
  private readonly BASELINE_FACTOR = 1.0; 

  // Parámetros de beep - OPTIMIZADOS PARA MEJORAR RESPUESTA
  private readonly BEEP_PRIMARY_FREQUENCY = 880; 
  private readonly BEEP_SECONDARY_FREQUENCY = 440; 
  private readonly BEEP_DURATION = 50; // Reducida para respuesta más rápida 
  private readonly BEEP_VOLUME = 0.9; 
  private readonly MIN_BEEP_INTERVAL_MS = 250; // Reducido para permitir detectar más latidos

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
  private beepOscillator: OscillatorNode | null = null;
  private beepGain: GainNode | null = null;

  private readonly BUTTERWORTH_ORDER = 4;
  private readonly CUTOFF_LOW = 0.5;  // Hz
  private readonly CUTOFF_HIGH = 4.0; // Hz
  private readonly SAMPLING_RATE = 30; // Hz

  private butterworth = {
    x: new Array(this.BUTTERWORTH_ORDER + 1).fill(0),
    y: new Array(this.BUTTERWORTH_ORDER + 1).fill(0),
    a: [1.0000, -3.8364, 5.5203, -3.5357, 0.8519], // Coeficientes pre-calculados
    b: [0.0002, 0.0008, 0.0012, 0.0008, 0.0002]    // para 0.5-4Hz @ 30Hz
  };

  private applyButterworth(value: number): number {
    // Desplazar valores anteriores
    for (let i = this.BUTTERWORTH_ORDER; i > 0; i--) {
      this.butterworth.x[i] = this.butterworth.x[i-1];
      this.butterworth.y[i] = this.butterworth.y[i-1];
    }
    
    this.butterworth.x[0] = value;
    
    // Aplicar filtro
    let filtered = this.butterworth.b[0] * this.butterworth.x[0];
    for (let i = 1; i <= this.BUTTERWORTH_ORDER; i++) {
      filtered += this.butterworth.b[i] * this.butterworth.x[i] - 
                  this.butterworth.a[i] * this.butterworth.y[i-1];
    }
    
    this.butterworth.y[0] = filtered;
    return filtered;
  }

  private readonly ADAPTIVE_THRESHOLD_ALPHA = 0.125;
  private readonly MIN_PEAK_DISTANCE_MS = 500;
  private peakThreshold = 0;
  private lastPeakValue = 0;
  private adaptivePeakTime = 0;

  private detectPeakAdaptive(value: number, timestamp: number): boolean {
    // Actualizar umbral adaptativo
    if (value > this.peakThreshold) {
      this.peakThreshold = value;
    } else {
      this.peakThreshold = this.peakThreshold * (1 - this.ADAPTIVE_THRESHOLD_ALPHA);
    }

    const timeSinceLastPeak = timestamp - this.adaptivePeakTime;
    const isPeak = value > this.peakThreshold * 0.6 && 
                  value > this.lastValue &&
                  timeSinceLastPeak >= this.MIN_PEAK_DISTANCE_MS;

    if (isPeak) {
      this.lastPeakValue = value;
      this.adaptivePeakTime = timestamp;
    }

    return isPeak;
  }

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      // Usar AudioContext existente si está disponible en el navegador
      if (typeof window !== 'undefined' && window.AudioContext) {
        this.audioContext = new AudioContext();
      } else if (typeof window !== 'undefined' && (window as any).webkitAudioContext) {
        // Fallback para Safari
        this.audioContext = new (window as any).webkitAudioContext();
      } else {
        console.warn("HeartBeatProcessor: AudioContext no soportado");
        return;
      }
      
      await this.audioContext.resume();
      console.log("HeartBeatProcessor: Audio Context Initialized, state:", this.audioContext.state);
      
      // Crear nodos de audio que se reutilizarán para mejor rendimiento
      this.beepGain = this.audioContext.createGain();
      this.beepGain.connect(this.audioContext.destination);
      this.beepGain.gain.value = 0; // Inicialmente silenciado
      
      // Reproducir un beep silencioso para inicializar completamente el audio
      await this.playBeep(0.01);
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext || this.isInWarmup()) return;

    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;

    try {
      // Optimización: reutilizar el contexto de audio existente
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Crear osciladores simplificados
      const primaryOscillator = this.audioContext.createOscillator();
      primaryOscillator.type = "sine";
      primaryOscillator.frequency.value = this.BEEP_PRIMARY_FREQUENCY;

      const primaryGain = this.audioContext.createGain();
      primaryGain.gain.value = 0;
      
      // Configurar envelope de forma más eficiente
      const currentTime = this.audioContext.currentTime;
      primaryGain.gain.setValueAtTime(0, currentTime);
      primaryGain.gain.linearRampToValueAtTime(volume, currentTime + 0.005);
      primaryGain.gain.exponentialRampToValueAtTime(0.01, currentTime + this.BEEP_DURATION / 1000);
      
      // Conexiones simplificadas
      primaryOscillator.connect(primaryGain);
      primaryGain.connect(this.audioContext.destination);
      
      // Iniciar y detener
      primaryOscillator.start();
      primaryOscillator.stop(currentTime + this.BEEP_DURATION / 1000 + 0.01);

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
    // Aplicar filtro Butterworth
    const filtered = this.applyButterworth(value);
    
    // Detección de picos adaptativa
    const timestamp = Date.now();
    const isPeak = this.detectPeakAdaptive(filtered, timestamp);
    
    // Actualizar BPM y confianza
    if (isPeak) {
      this.updateBPM();
      this.playBeep();
    }

    const confidence = this.calculateConfidence();
    
    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence,
      isPeak,
      filteredValue: filtered,
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
    console.log("HeartBeatProcessor: auto-reset detection states (low signal).");
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
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null } {
    return {
      intervals: [...this.bpmHistory],
      lastPeakTime: this.lastPeakTime
    };
  }

  private calculateConfidence(): number {
    if (this.bpmHistory.length < 3) return 0;
    
    // Calcular variabilidad de intervalos RR
    const intervals = this.bpmHistory.slice(-3);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
    const rmssd = Math.sqrt(variance);
    
    // Normalizar RMSSD a un valor de confianza
    const normalizedConfidence = Math.max(0, Math.min(1, 1 - (rmssd / 50)));
    
    return normalizedConfidence;
  }
}
