
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
  
  // Nuevas variables para el filtrado avanzado de falsos positivos
  private readonly SIMILARITY_THRESHOLD = 0.70; // Umbral de similitud para validación de formas de onda
  private readonly TEMPLATE_SIZE = 12; // Tamaño de la plantilla de forma de onda
  private readonly MIN_PEAKS_FOR_TEMPLATE = 3; // Mínimo de picos para formar un template válido
  private readonly MAX_JITTER_MS = 80; // Máxima variación permitida entre picos (en ms)
  private waveformTemplates: number[][] = []; // Plantillas de formas de onda de latidos válidos
  private lastValidPeakTimes: number[] = []; // Tiempos de los últimos picos válidos
  private readonly ADAPTIVE_REJECTION_FACTOR = 0.5; // Factor para rechazo adaptativo

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

  // Nueva función para calcular la similitud entre formas de onda (correlación)
  private calculateWaveformSimilarity(waveform1: number[], waveform2: number[]): number {
    if (waveform1.length !== waveform2.length || waveform1.length === 0) {
      return 0;
    }
    
    // Normalizar las ondas
    const normalize = (wave: number[]): number[] => {
      const min = Math.min(...wave);
      const max = Math.max(...wave);
      const range = max - min;
      if (range === 0) return wave.map(() => 0);
      return wave.map(v => (v - min) / range);
    };
    
    const norm1 = normalize(waveform1);
    const norm2 = normalize(waveform2);
    
    // Calcular la correlación
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
  
  // Nueva función para extraer una forma de onda alrededor de un pico
  private extractWaveform(centerIndex: number): number[] {
    const halfSize = Math.floor(this.TEMPLATE_SIZE / 2);
    const start = Math.max(0, centerIndex - halfSize);
    const end = Math.min(this.signalBuffer.length - 1, centerIndex + halfSize);
    
    if (end - start + 1 < this.TEMPLATE_SIZE) {
      return [];
    }
    
    return this.signalBuffer.slice(start, end + 1);
  }
  
  // Nueva función para verificar si un pico candidato es similar a plantillas existentes
  private isPeakSimilarToTemplates(peakIndex: number): boolean {
    if (this.waveformTemplates.length < this.MIN_PEAKS_FOR_TEMPLATE) {
      // Si no tenemos suficientes plantillas, aceptamos el pico y lo agregamos como plantilla
      const waveform = this.extractWaveform(peakIndex);
      if (waveform.length === this.TEMPLATE_SIZE) {
        this.waveformTemplates.push(waveform);
      }
      return true;
    }
    
    const candidateWaveform = this.extractWaveform(peakIndex);
    if (candidateWaveform.length !== this.TEMPLATE_SIZE) return false;
    
    // Verificar similitud con al menos una plantilla
    for (const template of this.waveformTemplates) {
      const similarity = this.calculateWaveformSimilarity(candidateWaveform, template);
      if (similarity >= this.SIMILARITY_THRESHOLD) {
        // Actualizar la plantilla con esta nueva forma de onda (aprendizaje continuo)
        const updatedTemplate = template.map((val, idx) => 
          (val * 0.8) + (candidateWaveform[idx] * 0.2)
        );
        this.waveformTemplates[this.waveformTemplates.indexOf(template)] = updatedTemplate;
        return true;
      }
    }
    
    // Verificar si el intervalo temporal es plausible
    const now = Date.now();
    if (this.lastValidPeakTimes.length >= 2) {
      const lastIntervals = [];
      for (let i = 1; i < this.lastValidPeakTimes.length; i++) {
        lastIntervals.push(this.lastValidPeakTimes[i] - this.lastValidPeakTimes[i-1]);
      }
      
      const avgInterval = lastIntervals.reduce((a, b) => a + b, 0) / lastIntervals.length;
      const expectedNextPeakTime = this.lastValidPeakTimes[this.lastValidPeakTimes.length - 1] + avgInterval;
      
      // Si el tiempo es cercano al esperado, aceptamos el pico aunque sea diferente
      if (Math.abs(now - expectedNextPeakTime) < this.MAX_JITTER_MS) {
        // Añadir esta forma de onda como una nueva plantilla para adaptarse a cambios
        this.waveformTemplates.push(candidateWaveform);
        if (this.waveformTemplates.length > 5) {
          this.waveformTemplates.shift(); // Mantener solo 5 plantillas máximo
        }
        return true;
      }
    }
    
    return false;
  }
  
  // Nueva función para verificar si el tiempo del pico es plausible según el ritmo cardíaco actual
  private isTimingPlausible(now: number): boolean {
    if (this.lastValidPeakTimes.length < 2) return true;
    
    // Calculamos intervalo promedio reciente (estimación del período cardíaco)
    const recentIntervals = [];
    for (let i = 1; i < this.lastValidPeakTimes.length; i++) {
      recentIntervals.push(this.lastValidPeakTimes[i] - this.lastValidPeakTimes[i-1]);
    }
    
    const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const lastPeakTime = this.lastValidPeakTimes[this.lastValidPeakTimes.length - 1];
    const timeSinceLastPeak = now - lastPeakTime;
    
    // Definir una ventana adaptativa basada en la variabilidad anterior
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

    if (this.signalBuffer.length < 30) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }

    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    let smoothDerivative = smoothed - this.lastValue;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    }
    this.lastValue = smoothed;

    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    
    // Versión mejorada de confirmación de pico con filtrado de falsos positivos
    let isConfirmedPeak = false;
    
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 3) {
        const len = this.peakConfirmationBuffer.length;
        const goingDown1 = this.peakConfirmationBuffer[len - 1] < this.peakConfirmationBuffer[len - 2];
        const goingDown2 = this.peakConfirmationBuffer[len - 2] < this.peakConfirmationBuffer[len - 3];

        if (goingDown1 && goingDown2) {
          const now = Date.now();
          const currentPeakIndex = this.signalBuffer.length - 1;
          
          // Validar por patrón de forma de onda y temporización
          const isWaveformValid = this.isPeakSimilarToTemplates(currentPeakIndex);
          const isTimingValid = this.isTimingPlausible(now);
          
          // Solo confirmamos picos que pasan todas las validaciones
          if (isWaveformValid && isTimingValid) {
            this.lastConfirmedPeak = true;
            isConfirmedPeak = true;
            
            // Registrar este pico válido
            this.lastValidPeakTimes.push(now);
            if (this.lastValidPeakTimes.length > 8) {
              this.lastValidPeakTimes.shift();
            }
          }
        }
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }

    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        this.playBeep(0.12); // Suena beep cuando se confirma pico
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
    console.log("HeartBeatProcessor: auto-reset detection states (low signal).");
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

    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline * 0.98;

    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.8), 0),
      1
    );
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.8), 0),
      1
    );

    // Aproximación a la confianza final
    const confidence = (amplitudeConfidence + derivativeConfidence) / 2;

    return { isPeak: isOverThreshold, confidence };
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
    
    // Reiniciar variables del nuevo algoritmo
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
