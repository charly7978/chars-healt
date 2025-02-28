export class HeartBeatProcessor {
  // ────────── CONFIGURACIONES PRINCIPALES SUPER OPTIMIZADAS ──────────
  private readonly SAMPLE_RATE = 30;
  private readonly WINDOW_SIZE = 210;          // Aumentado para mejor análisis espectral
  private readonly MIN_BPM = 25;              // Ampliado rango para captar bradicardias severas
  private readonly MAX_BPM = 230;             // Ampliado rango para taquicardias extremas
  private readonly SIGNAL_THRESHOLD = 0.16;    // Ajustado para mejor detección con señal débil
  private readonly MIN_CONFIDENCE = 0.68;      // Aumentado para mayor precisión y menos falsos positivos
  private readonly DERIVATIVE_THRESHOLD = -0.014; // Ajustado para mejor detección de pendientes
  private readonly MIN_PEAK_TIME_MS = 160;     // Optimizado para frecuencias cardíacas altas
  private readonly WARMUP_TIME_MS = 600;       // Reducido pero suficiente para estabilización

  // Parámetros de filtrado ultra optimizados
  private readonly MEDIAN_FILTER_WINDOW = 9;    // Aumentado para mejor eliminación de ruido
  private readonly MOVING_AVERAGE_WINDOW = 7;   // Aumentado para suavizado óptimo
  private readonly EMA_ALPHA = 0.22;           // Ajustado para mejor respuesta temporal
  private readonly BASELINE_FACTOR = 0.94;      // Ajustado para mejor seguimiento de línea base

  // Parámetros de beep optimizados
  private readonly BEEP_PRIMARY_FREQUENCY = 800;  // Ajustado
  private readonly BEEP_SECONDARY_FREQUENCY = 400;// Ajustado
  private readonly BEEP_DURATION = 35;           // Reducido
  private readonly BEEP_VOLUME = 0.35;           // Reducido
  private readonly MIN_BEEP_INTERVAL_MS = 120;   // Reducido

  // ────────── AUTO-RESET OPTIMIZADO ──────────
  private readonly LOW_SIGNAL_THRESHOLD = 0.008; // Más sensible para detectar pérdida de señal
  private readonly LOW_SIGNAL_FRAMES = 10;       // Ajustado para respuesta más rápida
  private lowSignalCount = 0;

  // ────────── NUEVOS PARÁMETROS PARA DETECCIÓN ROBUSTA ──────────
  private readonly PEAK_CONFIRMATION_WINDOW = 5;  // Ventana para confirmar picos
  private readonly PEAK_SLOPE_THRESHOLD = 0.008;  // Umbral de pendiente para picos válidos
  private readonly ADAPTIVE_THRESHOLD_FACTOR = 0.85; // Factor para umbral adaptativo
  private readonly SIGNAL_QUALITY_THRESHOLD = 0.55; // Umbral mínimo de calidad de señal
  private readonly MAX_CONSECUTIVE_REJECTIONS = 5; // Máximo de rechazos consecutivos antes de recalibrar

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
  private readonly BPM_ALPHA = 0.18; // Ajustado para suavizado más estable
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;
  private consecutiveRejections: number = 0; // Nuevo contador para rechazos consecutivos
  private adaptiveThreshold: number = 0; // Nuevo umbral adaptativo
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

  // Nuevo método: Filtro Butterworth paso bajo para eliminar ruido de alta frecuencia
  private butterworthLowPassFilter(value: number): number {
    // Implementación simplificada de un filtro Butterworth de segundo orden
    // Coeficientes calculados para frecuencia de corte de ~5Hz con frecuencia de muestreo de 30Hz
    const a = [1, -1.5610, 0.6414];
    const b = [0.0201, 0.0402, 0.0201];
    
    // Necesitamos al menos 2 valores previos
    if (this.signalBuffer.length < 2) return value;
    
    const n = this.signalBuffer.length;
    const filtered = b[0] * value + 
                     b[1] * this.signalBuffer[n-1] + 
                     b[2] * (n >= 2 ? this.signalBuffer[n-2] : this.signalBuffer[n-1]) - 
                     a[1] * (n >= 1 ? this.signalBuffer[n-1] : 0) - 
                     a[2] * (n >= 2 ? this.signalBuffer[n-2] : 0);
                     
    return filtered;
  }

  // Nuevo método: Cálculo de umbral adaptativo basado en la historia reciente
  private calculateAdaptiveThreshold(): number {
    if (this.signalBuffer.length < 30) return this.SIGNAL_THRESHOLD;
    
    // Tomar los últimos 30 valores para calcular el umbral adaptativo
    const recentValues = this.signalBuffer.slice(-30);
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const stdDev = Math.sqrt(
      recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length
    );
    
    // El umbral adaptativo es un porcentaje del rango dinámico de la señal
    return Math.max(
      this.SIGNAL_THRESHOLD * 0.7, // Mínimo umbral
      mean + stdDev * this.ADAPTIVE_THRESHOLD_FACTOR
    );
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
    const emaVal = this.calculateEMA(movAvgVal);
    
    // Aplicar filtro Butterworth para eliminar ruido de alta frecuencia
    const smoothed = this.butterworthLowPassFilter(emaVal);

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

    // Actualización de línea base con factor de olvido
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }

    // Cálculo de derivada suavizada para mejor detección de pendientes
    let smoothDerivative = 0;
    if (this.values.length === 3) {
      // Derivada central para mejor precisión
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    } else if (this.values.length >= 2) {
      smoothDerivative = this.values[this.values.length - 1] - this.values[this.values.length - 2];
    }
    this.lastValue = smoothed;

    // Actualizar umbral adaptativo
    this.adaptiveThreshold = this.calculateAdaptiveThreshold();

    // Detección de picos con umbral adaptativo y validación mejorada
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    
    // Confirmación robusta de picos con múltiples criterios
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence, smoothDerivative);

    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Almacenar valor del pico para análisis futuro
        this.lastValidPeakValues.push(normalizedValue);
        if (this.lastValidPeakValues.length > 8) {
          this.lastValidPeakValues.shift();
        }
        
        // Reproducir beep con volumen proporcional a la confianza
        const beepVolume = Math.min(0.12 + (confidence * 0.25), 0.4);
        this.playBeep(beepVolume);
        
        // Actualizar BPM con el nuevo intervalo
        this.updateBPM();
        
        // Resetear contador de rechazos consecutivos
        this.consecutiveRejections = 0;
      }
    } else if (isPeak && !isConfirmedPeak) {
      // Incrementar contador de rechazos consecutivos
      this.consecutiveRejections++;
      
      // Si hay demasiados rechazos consecutivos, recalibrar umbrales
      if (this.consecutiveRejections > this.MAX_CONSECUTIVE_REJECTIONS) {
        this.recalibrateThresholds();
        this.consecutiveRejections = 0;
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

  // Nuevo método: Recalibración de umbrales cuando hay problemas de detección
  private recalibrateThresholds(): void {
    // Ajustar umbral basado en la señal reciente
    if (this.signalBuffer.length > 30) {
      const recentValues = this.signalBuffer.slice(-30);
      const maxVal = Math.max(...recentValues);
      const minVal = Math.min(...recentValues);
      const range = maxVal - minVal;
      
      // Ajustar umbral adaptativo basado en el rango dinámico actual
      this.adaptiveThreshold = Math.max(
        this.SIGNAL_THRESHOLD * 0.6,
        (maxVal - minVal) * 0.35
      );
      
      console.log("HeartBeatProcessor: Recalibrating thresholds", {
        adaptiveThreshold: this.adaptiveThreshold,
        signalRange: range
      });
    }
  }

  private autoResetIfSignalIsLow(amplitude: number) {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = Math.max(0, this.lowSignalCount - 1); // Decremento gradual
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
    this.consecutiveRejections = 0;
    this.lastValidPeakValues = [];
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

    // Verificar tiempo mínimo entre picos para evitar detecciones múltiples
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Criterios mejorados para detección de picos
    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > Math.max(this.SIGNAL_THRESHOLD, this.adaptiveThreshold * 0.8) &&
      this.lastValue > this.baseline * 0.95;

    // Cálculo de confianza mejorado con múltiples factores
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.adaptiveThreshold * 1.2), 0),
      1
    );
    
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.6), 0),
      1
    );
    
    // Nuevo factor: consistencia con picos anteriores
    let peakConsistencyFactor = 0.5; // Valor por defecto
    if (this.lastValidPeakValues.length >= 3) {
      const avgPeakValue = this.lastValidPeakValues.reduce((sum, val) => sum + val, 0) / 
                          this.lastValidPeakValues.length;
      const peakDifference = Math.abs(normalizedValue - avgPeakValue) / avgPeakValue;
      peakConsistencyFactor = Math.max(0, 1 - peakDifference * 2);
    }

    // Confianza combinada con pesos optimizados
    const confidence = (
      amplitudeConfidence * 0.55 + 
      derivativeConfidence * 0.30 +
      peakConsistencyFactor * 0.15
    );

    return { isPeak: isOverThreshold, confidence };
  }

  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number,
    derivative: number
  ): boolean {
    // Añadir valor actual al buffer de confirmación
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > this.PEAK_CONFIRMATION_WINDOW) {
      this.peakConfirmationBuffer.shift();
    }

    // Si no es un pico candidato o la confianza es muy baja, rechazar inmediatamente
    if (!isPeak || confidence < this.MIN_CONFIDENCE * 0.7) {
      this.lastConfirmedPeak = false;
      return false;
    }
    
    // Si ya confirmamos un pico recientemente, evitar confirmaciones duplicadas
    if (this.lastConfirmedPeak) {
      return false;
    }

    // Verificar que tengamos suficientes muestras para confirmar
    if (this.peakConfirmationBuffer.length < 3) {
      return false;
    }

    // Criterios mejorados para confirmación de picos
    const len = this.peakConfirmationBuffer.length;
    
    // 1. Verificar que estamos en una pendiente descendente (después del pico)
    const goingDown1 = this.peakConfirmationBuffer[len - 1] < 
                     this.peakConfirmationBuffer[len - 2] * 0.94;
    const goingDown2 = this.peakConfirmationBuffer[len - 2] < 
                     this.peakConfirmationBuffer[len - 3] * 0.94;
    
    // 2. Verificar que la pendiente es suficientemente pronunciada
    const slopeIsSteep = Math.abs(derivative) > this.PEAK_SLOPE_THRESHOLD;
    
    // 3. Verificar que la confianza supera el umbral mínimo
    const confidenceIsHigh = confidence >= this.MIN_CONFIDENCE;
    
    // 4. Verificar que el valor normalizado es significativo
    const valueIsSignificant = normalizedValue > this.adaptiveThreshold;
    
    // Combinación de criterios para confirmación robusta
    if ((goingDown1 && goingDown2 && slopeIsSteep && confidenceIsHigh) || 
        (valueIsSignificant && confidenceIsHigh && slopeIsSteep)) {
      this.lastConfirmedPeak = true;
      return true;
    }

    return false;
  }

  private updateBPM() {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;

    const instantBPM = 60000 / interval;
    
    // Filtrar valores de BPM fuera de rango fisiológico
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      
      // Mantener un historial limitado para cálculos
      if (this.bpmHistory.length > 15) { // Aumentado para mejor estabilidad
        this.bpmHistory.shift();
      }
    }
  }

  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    
    // Inicialización del BPM suavizado
    if (this.smoothBPM === 0 && rawBPM > 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    
    // No actualizar si el rawBPM es 0 (sin datos suficientes)
    if (rawBPM === 0) return this.smoothBPM;
    
    // Filtro de suavizado exponencial con factor adaptativo
    // Usar factor más bajo (cambio más lento) si la diferencia es grande
    const bpmDiff = Math.abs(rawBPM - this.smoothBPM);
    const adaptiveAlpha = bpmDiff > 15 ? this.BPM_ALPHA * 0.5 : this.BPM_ALPHA;
    
    this.smoothBPM = adaptiveAlpha * rawBPM + (1 - adaptiveAlpha) * this.smoothBPM;
    return this.smoothBPM;
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) {
      return 0;
    }
    
    // Método mejorado: usar mediana con recorte para mayor robustez
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    // Recortar valores extremos (10% de cada lado)
    const cutAmount = Math.max(1, Math.floor(sorted.length * 0.1));
    const trimmed = sorted.slice(cutAmount, sorted.length - cutAmount);
    
    if (!trimmed.length) return 0;
    
    // Calcular media de los valores restantes
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    return avg;
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    
    // Método de cálculo final mejorado
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    // Recorte más agresivo para el valor final (15% de cada lado)
    const cut = Math.max(1, Math.round(sorted.length * 0.15));
    const finalSet = sorted.slice(cut, sorted.length - cut);
    
    if (!finalSet.length) return 0;
    
    // Usar mediana para el valor final (más robusta que la media)
    const median = finalSet[Math.floor(finalSet.length / 2)];
    
    // Calcular también la media para comparación
    const mean = finalSet.reduce((acc, val) => acc + val, 0) / finalSet.length;
    
    // Si la diferencia entre mediana y media es pequeña, usar la media
    // Si es grande, preferir la mediana (más robusta a outliers)
    const diff = Math.abs(median - mean);
    return Math.round(diff > 8 ? median : mean);
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
    this.consecutiveRejections = 0;
    this.adaptiveThreshold = this.SIGNAL_THRESHOLD;
    this.lastValidPeakValues = [];
  }

  public getRRIntervals(): { intervals: number[]; lastPeakTime: number | null } {
    // Convertir historial de BPM a intervalos RR (en ms)
    const rrIntervals = this.bpmHistory.map(bpm => 60000 / bpm);
    
    return {
      intervals: rrIntervals,
      lastPeakTime: this.lastPeakTime
    };
  }
}
