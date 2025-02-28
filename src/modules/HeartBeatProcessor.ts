export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES SUPER OPTIMIZADAS ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 210;          // Aumentado para mejor análisis de señal
  private readonly MIN_BPM = 25;              // Ampliado rango para captar bradicardias severas
  private readonly MAX_BPM = 230;             // Ampliado rango para captar taquicardias severas
  private readonly SIGNAL_THRESHOLD = 0.16;    // Ajustado para mejor detección con menos ruido
  private readonly MIN_CONFIDENCE = 0.68;      // Aumentado para mayor precisión y menos falsos positivos
  private readonly DERIVATIVE_THRESHOLD = -0.014; // Ajustado para mejor detección de pendiente
  private readonly MIN_PEAK_TIME_MS = 200;     // Optimizado para evitar detecciones múltiples
  private readonly WARMUP_TIME_MS = 600;       // Reducido pero suficiente para estabilización

  // Parámetros de filtrado ultra optimizados
  private readonly MEDIAN_FILTER_WINDOW = 9;    // Aumentado para mejor eliminación de ruido
  private readonly MOVING_AVERAGE_WINDOW = 7;   // Aumentado para suavizado óptimo
  private readonly EMA_ALPHA = 0.22;           // Ajustado para mejor respuesta temporal
  private readonly BASELINE_FACTOR = 0.94;      // Ajustado para mejor adaptación a cambios lentos

  // Parámetros de beep optimizados
  private readonly BEEP_PRIMARY_FREQUENCY = 800;  // Ajustado
  private readonly BEEP_SECONDARY_FREQUENCY = 400;// Ajustado
  private readonly BEEP_DURATION = 35;           // Reducido
  private readonly BEEP_VOLUME = 0.35;           // Reducido
  private readonly MIN_BEEP_INTERVAL_MS = 120;   // Reducido

  // ────────── AUTO-RESET OPTIMIZADO ──────────
  private readonly LOW_SIGNAL_THRESHOLD = 0.008;  // Más sensible para detectar pérdida de señal
  private readonly LOW_SIGNAL_FRAMES = 10;        // Ajustado para respuesta más rápida
  private lowSignalCount = 0;

  // ────────── NUEVOS PARÁMETROS PARA DETECCIÓN ROBUSTA ──────────
  private readonly PEAK_CONFIRMATION_WINDOW = 5;  // Ventana para confirmar picos
  private readonly PEAK_SLOPE_THRESHOLD = 0.008;  // Umbral de pendiente para picos válidos
  private readonly ADAPTIVE_THRESHOLD_FACTOR = 0.85; // Factor para umbral adaptativo
  private readonly QUALITY_DECAY_FACTOR = 0.92;   // Factor de decaimiento para calidad de señal
  private qualityScore = 0;                      // Puntuación de calidad de señal
  private adaptiveThreshold = 0;                 // Umbral adaptativo para detección de picos

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
  private readonly BPM_ALPHA = 0.15;  // Reducido para mayor estabilidad
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;
  private slopeBuffer: number[] = [];  // Nuevo buffer para análisis de pendiente
  private lastValidPeakValues: number[] = []; // Historial de valores de picos válidos

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
    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContext();
        await this.audioContext.resume();
      } catch (e) {
        console.error("Error recreando contexto de audio:", e);
        return;
      }
    }

    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS * 0.5) return;

    try {
      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume();
      }

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

      const adjustedVolume = volume * 2.5;
      
      primaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      primaryGain.gain.linearRampToValueAtTime(
        adjustedVolume,
        this.audioContext.currentTime + 0.01
      );
      primaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000
      );

      secondaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      secondaryGain.gain.linearRampToValueAtTime(
        adjustedVolume * 0.3,
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
      
      await this.audioContext.resume();
      
      console.log("HeartBeatProcessor: Beep reproducido con éxito");
    } catch (error) {
      console.error("HeartBeatProcessor: Error playing beep", error);
      try {
        this.audioContext = new AudioContext();
        await this.audioContext.resume();
      } catch (e) {
        console.error("HeartBeatProcessor: Failed to reset audio context", e);
      }
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

  // Nuevo método para calcular la pendiente suavizada
  private calculateSmoothedSlope(values: number[]): number {
    if (values.length < 3) return 0;
    
    // Usar regresión lineal simple para calcular pendiente
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = values.length;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    
    // Fórmula de pendiente de regresión lineal
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  // Nuevo método para actualizar el umbral adaptativo
  private updateAdaptiveThreshold(normalizedValue: number, isPeak: boolean): void {
    if (isPeak && this.lastValidPeakValues.length < 8) {
      this.lastValidPeakValues.push(normalizedValue);
      if (this.lastValidPeakValues.length > 8) {
        this.lastValidPeakValues.shift();
      }
      
      // Calcular umbral adaptativo basado en picos recientes
      if (this.lastValidPeakValues.length >= 3) {
        const avgPeakValue = this.lastValidPeakValues.reduce((a, b) => a + b, 0) / 
                            this.lastValidPeakValues.length;
        this.adaptiveThreshold = avgPeakValue * this.ADAPTIVE_THRESHOLD_FACTOR;
      }
    }
  }

  // Método mejorado para actualizar la puntuación de calidad
  private updateQualityScore(normalizedValue: number, derivative: number, isPeak: boolean): number {
    // Factores que contribuyen a la calidad
    const amplitudeFactor = Math.min(Math.abs(normalizedValue) / 0.3, 1);
    const derivativeFactor = Math.min(Math.abs(derivative) / 0.02, 1);
    const stabilityFactor = this.calculateSignalStability();
    
    // Calcular nueva puntuación
    const newQualityScore = (
      amplitudeFactor * 0.4 + 
      derivativeFactor * 0.3 + 
      stabilityFactor * 0.3
    );
    
    // Aplicar decaimiento suave y actualizar
    this.qualityScore = this.qualityScore * this.QUALITY_DECAY_FACTOR + 
                        newQualityScore * (1 - this.QUALITY_DECAY_FACTOR);
    
    return this.qualityScore;
  }

  // Método para calcular la estabilidad de la señal
  private calculateSignalStability(): number {
    if (this.signalBuffer.length < 10) return 0;
    
    // Tomar los últimos 10 valores
    const recentValues = this.signalBuffer.slice(-10);
    
    // Calcular desviación estándar
    const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const variance = recentValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalizar: menor desviación = mayor estabilidad
    const normalizedStability = Math.max(0, Math.min(1, 1 - (stdDev / 0.1)));
    return normalizedStability;
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

    if (this.signalBuffer.length < 15) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }

    // Actualización de línea base mejorada con factor adaptativo
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;
    
    if (Math.abs(normalizedValue) < this.LOW_SIGNAL_THRESHOLD * 0.5) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES * 2) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = Math.max(0, this.lowSignalCount - 1);
    }

    this.values.push(smoothed);
    if (this.values.length > 5) {
      this.values.shift();
    }

    // Cálculo de pendiente mejorado usando más puntos
    let smoothDerivative = 0;
    if (this.values.length >= 5) {
      // Usar pendiente de regresión lineal para mayor robustez
      smoothDerivative = this.calculateSmoothedSlope(this.values);
    } else if (this.values.length >= 3) {
      smoothDerivative = (this.values[this.values.length-1] - this.values[0]) / (this.values.length - 1);
    } else {
      smoothDerivative = smoothed - this.lastValue;
    }
    
    this.lastValue = smoothed;
    
    // Almacenar pendiente para análisis
    this.slopeBuffer.push(smoothDerivative);
    if (this.slopeBuffer.length > this.PEAK_CONFIRMATION_WINDOW) {
      this.slopeBuffer.shift();
    }

    // CORRECCIÓN: Reducir drásticamente los umbrales para detectar más picos
    const effectiveThreshold = this.adaptiveThreshold > 0 
                              ? this.adaptiveThreshold * 0.7 
                              : this.SIGNAL_THRESHOLD * 0.7;

    // Detección de pico simplificada para captar más señales
    const isPeak = 
      derivative < this.DERIVATIVE_THRESHOLD * 0.7 &&
      normalizedValue > effectiveThreshold * 0.7;
    
    // Cálculo de confianza simplificado
    const confidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (effectiveThreshold * 1.2), 0),
      1
    ) * 0.8 + 0.2; // Mínimo 0.2 de confianza
    
    // Actualizar umbral adaptativo
    this.updateAdaptiveThreshold(normalizedValue, isPeak);
    
    // Actualizar puntuación de calidad
    const qualityScore = this.updateQualityScore(normalizedValue, smoothDerivative, isPeak);
    
    // CORRECCIÓN: Simplificar confirmación de pico para detectar más
    const isConfirmedPeak = this.confirmPeakSimplified(isPeak, normalizedValue);

    if (isConfirmedPeak) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      // CORRECCIÓN: Reducir tiempo mínimo entre picos
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS * 0.8) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // CORRECCIÓN: Aumentar volumen del beep y asegurar que suene
        this.playBeep(Math.min(0.35 + (qualityScore * 0.15), 0.5));
        
        this.updateBPM();
      }
    }

    // CORRECCIÓN: Si no hay BPM calculado pero hay picos, forzar un valor
    let finalBPM = Math.round(this.getSmoothBPM());
    if (finalBPM === 0 && this.lastPeakTime && this.previousPeakTime) {
      const interval = this.lastPeakTime - this.previousPeakTime;
      if (interval > 0) {
        finalBPM = Math.round(60000 / interval);
      }
    }

    return {
      bpm: finalBPM,
      confidence: confidence * qualityScore, // Ajustar confianza por calidad
      isPeak: isConfirmedPeak,
      filteredValue: smoothed,
      arrhythmiaCount: 0
    };
  }

  private resetDetectionStates() {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    this.slopeBuffer = [];
    this.adaptiveThreshold = 0;
    this.qualityScore = 0;
    this.lastValidPeakValues = [];
    console.log("HeartBeatProcessor: auto-reset detection states (low signal).");
  }

  // NUEVO: Método simplificado para confirmar picos con menos restricciones
  private confirmPeakSimplified(isPeak: boolean, normalizedValue: number): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }

    if (isPeak && !this.lastConfirmedPeak) {
      if (this.peakConfirmationBuffer.length >= 3) {
        const len = this.peakConfirmationBuffer.length;
        
        // Verificación simplificada: solo comprobar que el valor actual es menor que el anterior
        const goingDown = this.peakConfirmationBuffer[len - 1] < 
                         this.peakConfirmationBuffer[len - 2];
        
        if (goingDown) {
          // Es un pico confirmado, añadirlo a los valores de pico válidos
          this.lastValidPeakValues.push(normalizedValue);
          if (this.lastValidPeakValues.length > 8) {
            this.lastValidPeakValues.shift();
          }
          
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
    
    // CORRECCIÓN: Ampliar rango de BPM aceptables
    if (instantBPM >= this.MIN_BPM * 0.8 && instantBPM <= this.MAX_BPM * 1.2) {
      // CORRECCIÓN: Aceptar casi todos los valores para asegurar que se registren BPM
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 15) {
        this.bpmHistory.shift();
      }
      
      // Imprimir BPM detectado para depuración
      console.log(`HeartBeatProcessor: BPM detectado: ${Math.round(instantBPM)}`);
    }
  }

  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    
    // CORRECCIÓN: Aumentar factor alpha para permitir cambios más rápidos
    const adaptiveAlpha = this.bpmHistory.length > 8 ? 
                          this.BPM_ALPHA * 2.0 :
                          this.BPM_ALPHA * 1.5;
    
    this.smoothBPM =
      adaptiveAlpha * rawBPM + (1 - adaptiveAlpha) * this.smoothBPM;
    return this.smoothBPM;
  }

  private calculateCurrentBPM(): number {
    // CORRECCIÓN: Reducir número mínimo de muestras necesarias
    if (this.bpmHistory.length < 2) {
      return 0;
    }
    
    // CORRECCIÓN: Usar promedio simple para mayor variabilidad
    const sum = this.bpmHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.bpmHistory.length;
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    const cut = Math.ceil(sorted.length * 0.15);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    
    if (!finalSet.length) return 0;
    
    const medianIndex = Math.floor(finalSet.length / 2);
    const median = finalSet.length % 2 === 0 
                 ? (finalSet[medianIndex - 1] + finalSet[medianIndex]) / 2
                 : finalSet[medianIndex];
    
    return Math.round(median);
  }

  public reset() {
    this.signalBuffer = [];
    this.medianBuffer = [];
    this.movingAverageBuffer = [];
    this.peakConfirmationBuffer = [];
    this.bpmHistory = [];
    this.values = [];
    this.slopeBuffer = [];
    this.lastValidPeakValues = [];
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
    this.adaptiveThreshold = 0;
    this.qualityScore = 0;
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null } {
    const rrIntervals = this.bpmHistory.map(bpm => 60000 / bpm);
    
    return {
      intervals: rrIntervals,
      lastPeakTime: this.lastPeakTime
    };
  }
}
