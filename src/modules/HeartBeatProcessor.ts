export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 60;
  private readonly MIN_BPM = 40;
  private readonly MAX_BPM = 200; // Se mantiene amplio para no perder picos fuera de rango
  private readonly SIGNAL_THRESHOLD = 0.45; // Increased from 0.40 for better peak detection
  private readonly MIN_CONFIDENCE = 0.65; // Increased from 0.60 for higher certainty
  private readonly DERIVATIVE_THRESHOLD = -0.04; // Changed from -0.03 for better sensitivity
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

  // Parámetros calibrables
  private signalThreshold: number;
  private minConfidence: number;
  private derivativeThreshold: number;
  private perfusionIndex: number;
  private qualityThreshold: number;

  constructor() {
    this.initAudio();
    this.reset();
    
    // Inicializar con valores predeterminados
    this.signalThreshold = this.SIGNAL_THRESHOLD;
    this.minConfidence = this.MIN_CONFIDENCE;
    this.derivativeThreshold = this.DERIVATIVE_THRESHOLD;
    this.perfusionIndex = 0.5;
    this.qualityThreshold = 0.65;
    
    // Cargar configuraciones de calibración si existen
    this.loadCalibrationSettings();
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
    amplitude?: number;
  } {
    // Guardar tiempo de inicio si es el primer valor
    if (this.values.length === 0) {
      this.startTime = Date.now();
    }
    
    // Agregar el valor a la lista
    this.values.push(value);
    
    // Aplicar filtros para eliminar ruido
    const median = this.medianFilter(value);
    const movingAvg = this.calculateMovingAverage(median);
    const filtered = this.calculateEMA(movingAvg);
    
    // Almacenar el valor filtrado en el buffer
    this.signalBuffer.push(filtered);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }
    
    // Calcular la línea de base si hay suficientes datos
    if (this.signalBuffer.length >= 10) {
      const min = Math.min(...this.signalBuffer);
      const max = Math.max(...this.signalBuffer);
      this.baseline = min + (max - min) * this.BASELINE_FACTOR * 0.25;
    }
    
    // Normalizar el valor filtrado respecto a la línea de base
    const normalizedValue = filtered - this.baseline;
    
    // Calcular la derivada del valor (pendiente)
    const derivative = filtered - this.lastValue;
    this.lastValue = filtered;
    
    // Calcular la amplitud de la señal para evaluar calidad
    const amplitude = Math.max(...this.signalBuffer) - Math.min(...this.signalBuffer);
    
    // Detectar si hay señal muy baja
    this.autoResetIfSignalIsLow(amplitude);
    
    // Comprobar si es un pico utilizando la configuración calibrada
    const { isPeak, confidence } = this.detectPeak(normalizedValue, derivative);
    
    // Confirmar el pico para reducir falsos positivos
    const confirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);
    
    // Si se detecta un pico, actualizar el tiempo y recalcular BPM
    if (confirmedPeak) {
      const now = Date.now();
      
      // Si ya teníamos un pico anterior, calcular el intervalo
      if (this.lastPeakTime !== null) {
        const interval = now - this.lastPeakTime;
        
        // Convertir el intervalo a BPM y agregarlo al historial
        const instantBPM = 60000 / interval;
        
        // Solo registrar BPM que estén dentro de rango fisiológico
        if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
          this.bpmHistory.push(instantBPM);
          // Limitar el historial a los últimos 10 valores
          if (this.bpmHistory.length > 10) {
            this.bpmHistory.shift();
          }
        }
      }
      
      // Actualizar tiempos de pico
      this.previousPeakTime = this.lastPeakTime;
      this.lastPeakTime = now;
      
      // Reproducir un beep si ha pasado suficiente tiempo
      if (now - this.lastBeepTime > this.MIN_BEEP_INTERVAL_MS) {
        this.playBeep();
        this.lastBeepTime = now;
      }
    }
    
    // Actualizar BPM suavizado
    this.updateBPM();
    
    // Determinar arrhythmiaCount (este valor vendría de otro módulo, lo simulamos para este ejemplo)
    const arrhythmiaCount = 0;
    
    return {
      bpm: this.getSmoothBPM(),
      confidence: confidence,
      isPeak: confirmedPeak,
      filteredValue: filtered,
      arrhythmiaCount: arrhythmiaCount,
      amplitude: amplitude
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
    // Usar parámetros calibrados en lugar de constantes fijas
    const isPeak = 
      normalizedValue > this.signalThreshold && 
      derivative < this.derivativeThreshold;
    
    let confidence = 0;
    
    if (isPeak) {
      // Calcular confianza basada en qué tan fuerte es la señal
      confidence = Math.min(
        1.0, 
        (normalizedValue / this.signalThreshold) * 
        Math.abs(derivative / this.derivativeThreshold)
      );
    }
    
    return { isPeak, confidence };
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

    if (isPeak && !this.lastConfirmedPeak && confidence >= this.minConfidence) {
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

  public getSmoothBPM(): number {
    // Si no hay suficientes datos, retornar 0
    if (this.bpmHistory.length === 0) {
      return 0;
    }
    
    // Calcular un promedio ponderado de las últimas lecturas
    const weightedSum = this.bpmHistory.reduce((sum, bpm, index) => {
      // Damos más peso a las lecturas más recientes
      const weight = (index + 1) / this.bpmHistory.length;
      return sum + bpm * weight;
    }, 0);
    
    const weightedAverage = weightedSum / (this.bpmHistory.reduce((sum, _, index) => sum + (index + 1) / this.bpmHistory.length, 0));
    
    // Actualizar el BPM suavizado
    this.smoothBPM = this.smoothBPM === 0
      ? weightedAverage
      : this.smoothBPM * 0.7 + weightedAverage * 0.3;
    
    // Asegurar que el valor esté dentro de límites fisiológicos
    const boundedBPM = Math.max(this.MIN_BPM, Math.min(this.MAX_BPM, this.smoothBPM));
    
    // Retornar valor redondeado a entero
    return Math.round(boundedBPM);
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length === 0) {
      return 0;
    }
    
    // Filtrar valores extremos para obtener un cálculo más estable
    const sortedBPM = [...this.bpmHistory].sort((a, b) => a - b);
    const validBPM = sortedBPM.slice(
      Math.floor(sortedBPM.length * 0.2), 
      Math.ceil(sortedBPM.length * 0.8)
    );
    
    // Si no quedan suficientes valores después del filtrado, usar el último BPM calculado
    if (validBPM.length === 0) {
      return Math.round(this.getSmoothBPM());
    }
    
    // Calcular el promedio de los valores válidos
    const average = validBPM.reduce((sum, bpm) => sum + bpm, 0) / validBPM.length;
    
    // Retornar valor redondeado a entero
    return Math.round(average);
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

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null; amplitudes?: number[] } {
    // Critical fix: Pass amplitude data derived from RR intervals
    // This ensures arrhythmia detection has amplitude data to work with
    const amplitudes = this.bpmHistory.map(bpm => {
      // Higher BPM (shorter RR) typically means lower amplitude for premature beats
      return 100 / (bpm || 800) * (this.getSmoothBPM() / 100);
    });
    
    return {
      intervals: [...this.bpmHistory],
      lastPeakTime: this.lastPeakTime,
      amplitudes: amplitudes
    };
  }

  /**
   * Carga las configuraciones de calibración desde localStorage
   */
  private loadCalibrationSettings() {
    try {
      const savedSettings = localStorage.getItem('calibrationSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        
        // Actualizar parámetros si existen en la configuración
        if (settings.perfusionIndex !== undefined) {
          this.perfusionIndex = settings.perfusionIndex;
          // Ajustar el umbral de señal basado en el índice de perfusión
          this.signalThreshold = this.SIGNAL_THRESHOLD * (1 + (this.perfusionIndex - 0.5) * 0.3);
        }
        
        if (settings.qualityThreshold !== undefined) {
          this.qualityThreshold = settings.qualityThreshold;
          // Ajustar confianza mínima basada en umbral de calidad
          this.minConfidence = Math.max(0.6, this.qualityThreshold);
        }
        
        console.log('Configuración de calibración cargada:', {
          perfusionIndex: this.perfusionIndex,
          qualityThreshold: this.qualityThreshold,
          adjustedSignalThreshold: this.signalThreshold,
          adjustedMinConfidence: this.minConfidence
        });
      }
    } catch (error) {
      console.error('Error cargando configuración de calibración:', error);
    }
  }
  
  /**
   * Calibra el procesador con nuevos parámetros
   */
  public calibrate(perfusionIndex?: number, qualityThreshold?: number): void {
    if (perfusionIndex !== undefined) {
      this.perfusionIndex = perfusionIndex;
      // Ajusta el umbral de señal basado en el índice de perfusión
      this.signalThreshold = this.SIGNAL_THRESHOLD * (1 + (this.perfusionIndex - 0.5) * 0.3);
    }
    
    if (qualityThreshold !== undefined) {
      this.qualityThreshold = qualityThreshold;
      // Ajusta confianza mínima basada en umbral de calidad
      this.minConfidence = Math.max(0.6, this.qualityThreshold);
    }
    
    // Resetea los buffers y estados para empezar limpio
    this.resetDetectionStates();
    
    console.log('HeartBeatProcessor calibrado con nuevos parámetros:', {
      perfusionIndex: this.perfusionIndex,
      qualityThreshold: this.qualityThreshold,
      signalThreshold: this.signalThreshold,
      minConfidence: this.minConfidence
    });
  }
  
  /**
   * Forzar una actualización de calibración basada en las últimas mediciones
   */
  public autoCalibrate(): void {
    // Si tenemos suficientes datos, ajustamos automáticamente los parámetros
    if (this.values.length > 30) {
      const recentValues = this.values.slice(-30);
      const avgValue = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
      const maxValue = Math.max(...recentValues);
      
      // Calcular un índice de perfusión basado en la señal actual
      const estimatedPerfusion = Math.min(1.0, Math.max(0.1, avgValue / (maxValue || 1) * 2));
      
      // Aplicar calibración con el valor estimado
      this.calibrate(estimatedPerfusion);
      
      console.log('Auto-calibración aplicada con índice de perfusión estimado:', estimatedPerfusion);
    }
  }

  /**
   * Obtiene los parámetros de calibración actuales
   */
  public getCalibrationParams(): {
    perfusionIndex: number;
    qualityThreshold: number;
    signalThreshold: number;
    minConfidence: number;
  } {
    return {
      perfusionIndex: this.perfusionIndex,
      qualityThreshold: this.qualityThreshold,
      signalThreshold: this.signalThreshold,
      minConfidence: this.minConfidence
    };
  }
}
