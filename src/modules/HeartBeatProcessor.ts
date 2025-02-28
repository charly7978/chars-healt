export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 100;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200;
  private readonly SIGNAL_THRESHOLD = 0.25;
  private readonly MIN_CONFIDENCE = 0.50;
  private readonly DERIVATIVE_THRESHOLD = -0.02;
  private readonly MIN_PEAK_TIME_MS = 300;
  private readonly WARMUP_TIME_MS = 2000;

  // Parámetros de filtrado mejorados
  private readonly MEDIAN_FILTER_WINDOW = 5;
  private readonly MOVING_AVERAGE_WINDOW = 5;
  private readonly EMA_ALPHA = 0.3;
  private readonly BASELINE_FACTOR = 0.95;

  // Parámetros de beep optimizados para sonido médico profesional
  private readonly BEEP_PRIMARY_FREQUENCY = 660; // Frecuencia estándar de monitores médicos
  private readonly BEEP_SECONDARY_FREQUENCY = 440;
  private readonly BEEP_DURATION = 60; // Duración más corta para sonido más preciso
  private readonly BEEP_VOLUME = 0.8; // Volumen más moderado
  private readonly MIN_BEEP_INTERVAL_MS = 200;

  // ────────── AUTO-RESET SI LA SEÑAL ES MUY BAJA ──────────
  private readonly LOW_SIGNAL_THRESHOLD = 0.02;
  private readonly LOW_SIGNAL_FRAMES = 15;
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
  
  // Nuevas variables para el filtrado avanzado de falsos positivos
  private readonly SIMILARITY_THRESHOLD = 0.70;
  private readonly TEMPLATE_SIZE = 12;
  private readonly MIN_PEAKS_FOR_TEMPLATE = 3;
  private readonly MAX_JITTER_MS = 80;
  private waveformTemplates: number[][] = [];
  private lastValidPeakTimes: number[] = [];
  private readonly ADAPTIVE_REJECTION_FACTOR = 0.5;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      // Inicializar el contexto de audio solo si no existe
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log("HeartBeatProcessor: Audio Context Created", this.audioContext.state);
      }
      
      // Asegurarse de que el contexto esté activo
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log("HeartBeatProcessor: Audio Context Resumed");
      }
      
      // Reproducir un beep silencioso para activar el audio
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0.01;
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.1);
      
      // Agregar listener para manejar cambios de estado del contexto
      this.audioContext.onstatechange = () => {
        console.log("HeartBeatProcessor: Audio Context state changed to", this.audioContext.state);
      };
      
      // Agregar evento de click global para reanudar el contexto si está suspendido
      document.addEventListener('click', () => {
        if (this.audioContext?.state === 'suspended') {
          this.audioContext.resume().then(() => {
            console.log("HeartBeatProcessor: Audio Context resumed after user interaction");
          });
        }
      }, { once: true });
      
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        await this.audioContext.resume();
      } catch (e) {
        console.error("Error creando contexto de audio:", e);
        return;
      }
    }

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const now = this.audioContext.currentTime;
      
      // Crear oscilador principal
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      // Configurar el tipo de onda y frecuencia
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(this.BEEP_PRIMARY_FREQUENCY, now);
      
      // Envelope más sofisticado para sonido médico
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.005);
      gainNode.gain.setValueAtTime(volume, now + 0.030);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.060);
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.start(now);
      oscillator.stop(now + 0.060);
      
      this.lastBeepTime = Date.now();
    } catch (error) {
      console.error("Error reproduciendo beep:", error);
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

  private calculateWaveformSimilarity(waveform1: number[], waveform2: number[]): number {
    if (waveform1.length !== waveform2.length || waveform1.length === 0) {
      return 0;
    }
    
    const normalize = (wave: number[]): number[] => {
      const min = Math.min(...wave);
      const max = Math.max(...wave);
      const range = max - min;
      if (range === 0) return wave.map(() => 0);
      return wave.map(v => (v - min) / range);
    };
    
    const norm1 = normalize(waveform1);
    const norm2 = normalize(waveform2);
    
    let sum = 0;
    let sum1 = 0;
    let sum2 = 0;
    
    for (let i = 0; i < norm1.length; i++) {
      sum += norm1[i] * norm2[i];
      sum1 += norm1[i] * norm1[i];
      sum2 += norm2[i] * norm2[i];
    }
    
    if (sum1 === 0 || sum2 === 0) return 0;
    return sum / Math.sqrt(sum1 * sum2);
  }
  
  private extractWaveform(centerIndex: number): number[] {
    const halfSize = Math.floor(this.TEMPLATE_SIZE / 2);
    const start = Math.max(0, centerIndex - halfSize);
    const end = Math.min(this.signalBuffer.length - 1, centerIndex + halfSize);
    
    if (end - start + 1 < this.TEMPLATE_SIZE) {
      return [];
    }
    
    return this.signalBuffer.slice(start, end + 1);
  }
  
  private isPeakSimilarToTemplates(peakIndex: number): boolean {
    if (this.waveformTemplates.length < this.MIN_PEAKS_FOR_TEMPLATE) {
      const waveform = this.extractWaveform(peakIndex);
      if (waveform.length === this.TEMPLATE_SIZE) {
        this.waveformTemplates.push(waveform);
      }
      return true;
    }
    
    const candidateWaveform = this.extractWaveform(peakIndex);
    if (candidateWaveform.length !== this.TEMPLATE_SIZE) return false;
    
    for (const template of this.waveformTemplates) {
      const similarity = this.calculateWaveformSimilarity(candidateWaveform, template);
      if (similarity >= this.SIMILARITY_THRESHOLD) {
        const updatedTemplate = template.map((val, idx) => 
          (val * 0.8) + (candidateWaveform[idx] * 0.2)
        );
        this.waveformTemplates[this.waveformTemplates.indexOf(template)] = updatedTemplate;
        return true;
      }
    }
    
    if (this.lastValidPeakTimes.length >= 2) {
      const lastIntervals = [];
      for (let i = 1; i < this.lastValidPeakTimes.length; i++) {
        lastIntervals.push(this.lastValidPeakTimes[i] - this.lastValidPeakTimes[i-1]);
      }
      
      const avgInterval = lastIntervals.reduce((a, b) => a + b, 0) / lastIntervals.length;
      const expectedNextPeakTime = this.lastValidPeakTimes[this.lastValidPeakTimes.length - 1] + avgInterval;
      
      if (Math.abs(Date.now() - expectedNextPeakTime) < this.MAX_JITTER_MS) {
        this.waveformTemplates.push(candidateWaveform);
        if (this.waveformTemplates.length > 5) {
          this.waveformTemplates.shift();
        }
        return true;
      }
    }
    
    return false;
  }
  
  private isTimingPlausible(now: number): boolean {
    if (this.lastValidPeakTimes.length < 2) return true;
    
    const recentIntervals = [];
    for (let i = 1; i < this.lastValidPeakTimes.length; i++) {
      recentIntervals.push(this.lastValidPeakTimes[i] - this.lastValidPeakTimes[i-1]);
    }
    
    const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const lastPeakTime = this.lastValidPeakTimes[this.lastValidPeakTimes.length - 1];
    const timeSinceLastPeak = now - lastPeakTime;
    
    const stdDev = Math.sqrt(
      recentIntervals.reduce((sum, interval) => 
        sum + Math.pow(interval - avgInterval, 2), 0) / recentIntervals.length
    );
    
    const minAcceptableInterval = Math.max(avgInterval - stdDev - 50, this.MIN_PEAK_TIME_MS);
    const maxAcceptableInterval = avgInterval + stdDev + 100;
    
    return timeSinceLastPeak >= minAcceptableInterval && timeSinceLastPeak <= maxAcceptableInterval;
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

    if (this.signalBuffer.length < Math.floor(this.WINDOW_SIZE * 0.5)) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }

    this.baseline = this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = (smoothed - this.baseline) * 1.5; // Amplificar señal
    
    if (Math.abs(normalizedValue) < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        this.reset();
        return {
          bpm: 0,
          confidence: 0,
          isPeak: false,
          filteredValue: 0,
          arrhythmiaCount: 0
        };
      }
    } else {
      this.lowSignalCount = Math.max(0, this.lowSignalCount - 1);
    }

    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    let smoothDerivative = 0;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    } else {
      smoothDerivative = smoothed - this.lastValue;
    }
    this.lastValue = smoothed;

    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    let isConfirmedPeak = false;

    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      const now = Date.now();
      if (this.lastPeakTime === null || (now - this.lastPeakTime) >= this.MIN_PEAK_TIME_MS) {
        isConfirmedPeak = true;
        this.lastConfirmedPeak = true;
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        if (!this.isInWarmup()) {
          this.playBeep(this.BEEP_VOLUME).catch(console.error);
        }
        
        this.updateBPM();
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }

    const currentBPM = this.calculateCurrentBPM();
    if (currentBPM > 0) {
      if (this.smoothBPM === 0) {
        this.smoothBPM = currentBPM;
      } else {
        this.smoothBPM = this.smoothBPM * 0.7 + currentBPM * 0.3;
      }
    }

    return {
      bpm: Math.round(this.smoothBPM),
      confidence,
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: normalizedValue,
      arrhythmiaCount: 0
    };
  }

  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;

    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Detección más precisa de picos
    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline * 0.98 &&
      this.values.length >= 3 &&
      this.values[1] > this.values[0] && // Confirmar tendencia ascendente
      this.values[1] > this.values[2];    // Confirmar pico local

    // Cálculo de confianza mejorado
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.5), 0),
      1
    );
    
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD), 0),
      1
    );

    // Añadir factor de estabilidad
    const stabilityConfidence = this.calculateStabilityConfidence();

    // Confianza ponderada
    const confidence = (
      amplitudeConfidence * 0.4 + 
      derivativeConfidence * 0.4 + 
      stabilityConfidence * 0.2
    );

    return { 
      isPeak: isOverThreshold && confidence > this.MIN_CONFIDENCE,
      confidence 
    };
  }

  private calculateStabilityConfidence(): number {
    if (this.bpmHistory.length < 3) return 0.5;

    const recentBPMs = this.bpmHistory.slice(-3);
    const avg = recentBPMs.reduce((a, b) => a + b, 0) / recentBPMs.length;
    const maxDev = Math.max(...recentBPMs.map(bpm => Math.abs(bpm - avg)));
    
    return Math.max(0, Math.min(1, 1 - (maxDev / 20)));
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
    
    this.waveformTemplates = [];
    this.lastValidPeakTimes = [];
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null } {
    return {
      intervals: [...this.bpmHistory],
      lastPeakTime: this.lastPeakTime
    };
  }
}
