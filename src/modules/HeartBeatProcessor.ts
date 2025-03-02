export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  private readonly SIGNAL_THRESHOLD = 0.45; // Increased from 0.40 for better peak detection
  private readonly MIN_CONFIDENCE = 0.65; // Increased from 0.60 for higher certainty
  
  // CORREGIDO: Cambiamos a valor positivo para detectar subida (no bajada)
  private readonly DERIVATIVE_THRESHOLD = 0.04; // Cambiado de -0.04 a 0.04 para detectar pico ascendente
  
  private readonly MIN_PEAK_TIME_MS = 400; 
  private readonly WARMUP_TIME_MS = 3000; 

  // Parámetros de filtrado
  private readonly MEDIAN_FILTER_WINDOW = 3; 
  private readonly MOVING_AVERAGE_WINDOW = 5; // Increased from 3 to reduce noise
  private readonly EMA_ALPHA = 0.4; 
  private readonly BASELINE_FACTOR = 1.0; 

  // Parámetros de beep mejorados para sonido más realista
  private readonly BEEP_PRIMARY_FREQUENCY = 660; // Frecuencia principal más baja (sonido más médico)
  private readonly BEEP_SECONDARY_FREQUENCY = 330; // Frecuencia secundaria más baja
  private readonly BEEP_DURATION = 60; // Duración más corta para "beep" más punzante y realista
  private readonly BEEP_VOLUME = 0.85; // Volumen ligeramente reducido
  private readonly MIN_BEEP_INTERVAL_MS = 300;
  
  // NUEVO: Variables para monitor cardíaco más realista
  private readonly USE_REAL_HEART_SOUND = true; // Usar sonido real de monitor
  private heartSoundBuffer: AudioBuffer | null = null;
  private heartSoundUrl = 'https://assets.mixkit.co/active_storage/sfx/2429/2429-preview.mp3'; // Sonido de latido cardíaco
  private isHeartSoundLoaded = false;
  private isHeartSoundLoading = false;

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
  
  // NUEVO: Almacenar valores de derivada para detección mejorada
  private derivativeBuffer: number[] = [];
  private readonly DERIVATIVE_BUFFER_SIZE = 5;

  // NUEVO: Almacenar amplitudes de los picos para mejorar la detección de arritmias
  private peakAmplitudes: number[] = [];
  private readonly MAX_AMPLITUDE_HISTORY = 20;
  
  // NUEVO: Indica si estamos en fase ascendente hacia un pico
  private isRisingEdge: boolean = false;
  private risingEdgeStartTime: number = 0;

  constructor() {
    this.initAudio();
    this.startTime = Date.now();
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      
      // Inicializar con un beep muy silencioso para activar el audio
      await this.playBeep(0.01);
      
      // Cargar sonido de latido de corazón en segundo plano
      if (this.USE_REAL_HEART_SOUND) {
        this.loadHeartSound();
      }
      
      console.log("HeartBeatProcessor: Audio Context Initialized");
    } catch (error) {
      console.error("HeartBeatProcessor: Error initializing audio", error);
    }
  }
  
  // NUEVO: Cargar sonido de monitor cardíaco real
  private async loadHeartSound() {
    if (!this.audioContext || this.isHeartSoundLoaded || this.isHeartSoundLoading) return;
    
    try {
      this.isHeartSoundLoading = true;
      const response = await fetch(this.heartSoundUrl);
      const arrayBuffer = await response.arrayBuffer();
      this.heartSoundBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.isHeartSoundLoaded = true;
      this.isHeartSoundLoading = false;
      console.log("HeartBeatProcessor: Heart sound loaded");
    } catch (error) {
      console.error("HeartBeatProcessor: Error loading heart sound:", error);
      this.isHeartSoundLoading = false;
      // Si falla, seguiremos usando el beep sintético
    }
  }

  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext || this.isInWarmup()) return;

    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;
    this.lastBeepTime = now;
    
    try {
      // NUEVO: Usar sonido de latido real si está disponible
      if (this.USE_REAL_HEART_SOUND && this.heartSoundBuffer && this.isHeartSoundLoaded) {
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = this.heartSoundBuffer;
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Reproducir solo la parte inicial del sonido (primeros 150ms)
        const duration = Math.min(0.15, this.heartSoundBuffer.duration);
        source.start(0, 0, duration);
        return;
      }
      
      // Fallback: usar beep sintético si el sonido real no está disponible
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

      // Envelope del sonido principal con ataque más rápido
      primaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      primaryGain.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + 0.005 // Ataque más rápido
      );
      primaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );

      // Envelope del sonido secundario con ataque más rápido
      secondaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      secondaryGain.gain.linearRampToValueAtTime(
        volume * 0.4, // Más proporción para segundo armónico (más realista)
        this.audioContext.currentTime + 0.005 // Ataque más rápido
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

    // MEJORADO: Detector de picos optimizado para sonido más natural
    const { isPeak, confidence, isRisingEdge } = this.detectPeak(normalizedValue, smoothDerivative);
    
    // NUEVO: Detección mejorada de fase ascendente
    if (isRisingEdge && !this.isRisingEdge) {
      this.isRisingEdge = true;
      this.risingEdgeStartTime = Date.now();
    } else if (!isRisingEdge && this.isRisingEdge) {
      this.isRisingEdge = false;
    }
    
    // Confirmación de picos más rigurosa
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);
    
    // CORREGIDO: Reproducir beep durante la fase ASCENDENTE del pico
    // en lugar de esperar a que se confirme en la cima o bajada
    const now = Date.now();
    const shouldPlayBeep = this.isRisingEdge && 
                         confidence > this.MIN_CONFIDENCE && 
                         !this.isInWarmup() &&
                         (now - this.lastBeepTime) >= this.MIN_BEEP_INTERVAL_MS;
    
    if (shouldPlayBeep) {
      this.playBeep(0.12 * confidence); // Ajustar volumen según confianza
    }

    // La detección del pico sigue funcionando igual para el cálculo de BPM
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // NUEVO: Almacenar amplitud del pico para detección de arritmias
        this.peakAmplitudes.push(Math.abs(normalizedValue));
        if (this.peakAmplitudes.length > this.MAX_AMPLITUDE_HISTORY) {
          this.peakAmplitudes.shift();
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

    // CORREGIDO: Detectar fase ascendente del pico (cuando la señal sube rápidamente)
    // Esto permite que el beep suene cuando el pico va subiendo, como en monitores reales
    const isRisingEdge = 
      derivative > this.DERIVATIVE_THRESHOLD && 
      normalizedValue > this.SIGNAL_THRESHOLD * 0.5 && 
      normalizedValue < this.SIGNAL_THRESHOLD * 1.5;
      
    // La detección del pico real para el cálculo de BPM sigue usando la lógica anterior
    // pero adaptada para funcionar con la nueva mecánica de detección
    const isPeakCandidate = 
      derivative < -0.01 &&  // Ahora buscamos cuando empieza a bajar (cima del pico)
      normalizedValue > this.SIGNAL_THRESHOLD &&
      this.lastValue > this.baseline * 0.98;

    // Refinamiento del cálculo de confianza
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.SIGNAL_THRESHOLD * 1.5), 0),
      1
    );
    
    // Derivada para confianza: valor absoluto para que funcione en ambas direcciones
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.9), 0),
      1
    );

    // Cálculo de confianza mejorado
    const confidence = (amplitudeConfidence * 0.6 + derivativeConfidence * 0.4);

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
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] } {
    // CRUCIAL: Pasar los datos de amplitud REALES en lugar de estimados
    return {
      intervals: this.bpmHistory.map(bpm => Math.round(60000 / bpm)), // Convertir BPM a intervalos RR en ms
      lastPeakTime: this.lastPeakTime,
      amplitudes: this.peakAmplitudes  // Pasar amplitudes reales de los picos
    };
  }
}
