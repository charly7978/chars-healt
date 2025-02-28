
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
  private readonly BEEP_DURATION = 50;           // Aumentado para que sea más audible
  private readonly BEEP_VOLUME = 0.40;           // Aumentado para que sea más audible
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
      await this.playBeep(0.01); // Prueba inicial de bajo volumen
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

  // Función modificada para aceptar el parámetro de audio activado
  public processSignal(value: number, audioEnabled: boolean = true): {
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

    // Actualización de línea base mejorada con factor adaptativo
    this.baseline =
      this.baseline * this.BASELINE_FACTOR + smoothed * (1 - this.BASELINE_FACTOR);

    const normalizedValue = smoothed - this.baseline;
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));

    this.values.push(smoothed);
    if (this.values.length > 5) { // Aumentado para mejor análisis de pendiente
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

    // Detección de pico mejorada con múltiples criterios
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    
    // Actualizar umbral adaptativo
    this.updateAdaptiveThreshold(normalizedValue, isPeak);
    
    // Actualizar puntuación de calidad
    const qualityScore = this.updateQualityScore(normalizedValue, smoothDerivative, isPeak);
    
    // Confirmación de pico con criterios más estrictos
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence, smoothDerivative);

    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;

      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Sólo reproducir el beep si el audio está habilitado
        if (audioEnabled) {
          // Volumen adaptativo basado en calidad
          this.playBeep(Math.min(0.12 + (qualityScore * 0.05), 0.2));
        }
        
        this.updateBPM();
      }
    }

    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence: confidence * qualityScore, // Ajustar confianza por calidad
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
      this.lowSignalCount = Math.max(0, this.lowSignalCount - 0.5); // Decremento gradual
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
    this.slopeBuffer = [];
    this.adaptiveThreshold = 0;
    this.qualityScore = 0;
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

    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }

    // Usar umbral adaptativo si está disponible, o el fijo si no
    const effectiveThreshold = this.adaptiveThreshold > 0 
                              ? this.adaptiveThreshold 
                              : this.SIGNAL_THRESHOLD;

    // Criterios mejorados para detección de picos
    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > effectiveThreshold &&
      this.lastValue > this.baseline * 0.95 &&
      this.slopeBuffer.length >= 3 && 
      // Verificar patrón de pendiente (positiva seguida de negativa)
      this.slopeBuffer[this.slopeBuffer.length-3] > this.PEAK_SLOPE_THRESHOLD &&
      this.slopeBuffer[this.slopeBuffer.length-1] < -this.PEAK_SLOPE_THRESHOLD;

    // Cálculo de confianza mejorado con múltiples factores
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (effectiveThreshold * 1.5), 0),
      1
    );
    
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.7), 0),
      1
    );
    
    // Nuevo factor: estabilidad de la señal
    const stabilityConfidence = this.calculateSignalStability();
    
    // Nuevo factor: consistencia de tiempo entre picos
    let timingConfidence = 0;
    if (this.previousPeakTime && this.lastPeakTime) {
      const lastInterval = this.lastPeakTime - this.previousPeakTime;
      const expectedInterval = 60000 / (this.getSmoothBPM() || 75); // Usar BPM actual o 75 como valor predeterminado
      const intervalDiff = Math.abs(timeSinceLastPeak - expectedInterval);
      timingConfidence = Math.max(0, Math.min(1, 1 - (intervalDiff / expectedInterval)));
    }

    // Combinar factores con pesos optimizados
    const confidence = (
      amplitudeConfidence * 0.45 + 
      derivativeConfidence * 0.30 +
      stabilityConfidence * 0.15 +
      timingConfidence * 0.10
    );

    return { isPeak: isOverThreshold, confidence };
  }

  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number,
    derivative: number
  ): boolean {
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 7) { // Aumentado para mejor confirmación
      this.peakConfirmationBuffer.shift();
    }

    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 5) { // Requiere más puntos para confirmación
        const len = this.peakConfirmationBuffer.length;
        
        // Verificar patrón de forma de onda típico de PPG:
        // 1. Subida rápida
        // 2. Pico claro
        // 3. Bajada gradual
        
        // Verificar que estamos en un pico real (valor actual menor que anterior)
        const goingDown1 = this.peakConfirmationBuffer[len - 1] < 
                         this.peakConfirmationBuffer[len - 2] * 0.95;
        
        // Verificar que el pico anterior fue real (valor anterior menor que el anterior a ese)
        const goingDown2 = this.peakConfirmationBuffer[len - 2] < 
                         this.peakConfirmationBuffer[len - 3] * 0.95;
        
        // Verificar que hubo una subida antes del pico
        const wasGoingUp = this.peakConfirmationBuffer[len - 4] < 
                          this.peakConfirmationBuffer[len - 3] * 0.95;
        
        // Verificar que la pendiente es suficientemente negativa (característica de un pico real)
        const steepEnough = derivative < this.DERIVATIVE_THRESHOLD * 0.8;

        if (goingDown1 && goingDown2 && wasGoingUp && steepEnough) {
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
    
    // Filtrado mejorado de valores BPM para mediciones reales
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      // Si ya tenemos valores, verificar que el nuevo no sea muy diferente
      if (this.bpmHistory.length > 0) {
        const avgBPM = this.calculateCurrentBPM();
        
        // Permitir mayor variabilidad para capturar cambios reales en la frecuencia cardíaca
        // Pero seguir filtrando valores claramente erróneos
        const variabilityThreshold = this.bpmHistory.length < 5 ? 0.45 : 0.35;
        
        if (avgBPM > 0 && Math.abs(instantBPM - avgBPM) / avgBPM > variabilityThreshold) {
          // Verificación adicional: si tenemos varios valores consecutivos en la misma dirección,
          // podría ser un cambio real en la frecuencia cardíaca (aceleración o desaceleración)
          const isConsistentTrend = this.checkConsistentTrend(instantBPM);
          
          if (!isConsistentTrend) {
            // No añadir valores muy atípicos sin tendencia consistente
            console.log("HeartBeatProcessor: Rejected outlier BPM:", instantBPM, "avg:", avgBPM);
            return;
          }
        }
      }
      
      this.bpmHistory.push(instantBPM);
      if (this.bpmHistory.length > 15) { // Aumentado para mejor estabilidad
        this.bpmHistory.shift();
      }
    }
  }

  // Nuevo método para verificar si hay una tendencia consistente en la frecuencia cardíaca
  private checkConsistentTrend(newBPM: number): boolean {
    if (this.bpmHistory.length < 3) return true;
    
    const lastValues = this.bpmHistory.slice(-3);
    const avgRecent = lastValues.reduce((sum, val) => sum + val, 0) / lastValues.length;
    
    // Determinar dirección de la tendencia
    const isIncreasing = newBPM > avgRecent;
    
    // Verificar si los últimos valores siguen la misma tendencia
    let consistentCount = 0;
    for (let i = 1; i < lastValues.length; i++) {
      if ((isIncreasing && lastValues[i] > lastValues[i-1]) ||
          (!isIncreasing && lastValues[i] < lastValues[i-1])) {
        consistentCount++;
      }
    }
    
    // Si al menos 2 de los últimos 3 valores siguen la misma tendencia,
    // consideramos que es una tendencia real
    return consistentCount >= 1;
  }

  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    
    // Suavizado adaptativo: menos suavizado para permitir cambios reales
    // Esto permite que la frecuencia cardíaca varíe más naturalmente
    const adaptiveAlpha = this.bpmHistory.length > 8 ? 
                          this.BPM_ALPHA * 1.2 : // Aumentar factor para más variabilidad
                          this.BPM_ALPHA;
    
    this.smoothBPM =
      adaptiveAlpha * rawBPM + (1 - adaptiveAlpha) * this.smoothBPM;
    return this.smoothBPM;
  }

  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) {
      return 0;
    }
    
    // Método mejorado: usar mediana con recorte para mayor robustez
    // pero permitir más variabilidad para capturar cambios reales
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    // Recortar valores extremos (solo 10% de cada lado para permitir más variabilidad)
    const cutPercentage = this.bpmHistory.length >= 8 ? 0.1 : 0.05;
    const cutAmount = Math.floor(sorted.length * cutPercentage);
    const trimmed = sorted.slice(cutAmount, sorted.length - cutAmount);
    
    if (!trimmed.length) return 0;
    
    // Calcular mediana del conjunto recortado
    const medianIndex = Math.floor(trimmed.length / 2);
    const median = trimmed.length % 2 === 0 
                 ? (trimmed[medianIndex - 1] + trimmed[medianIndex]) / 2
                 : trimmed[medianIndex];
    
    return median;
  }

  public getFinalBPM(): number {
    if (this.bpmHistory.length < 5) {
      return 0;
    }
    
    // Método mejorado para BPM final
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    
    // Recortar 15% de cada extremo para mayor robustez
    const cut = Math.ceil(sorted.length * 0.15);
    const finalSet = sorted.slice(cut, sorted.length - cut);
    
    if (!finalSet.length) return 0;
    
    // Usar mediana en lugar de media para mayor robustez
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
    // Convertir historial de BPM a intervalos RR (ms)
    const rrIntervals = this.bpmHistory.map(bpm => 60000 / bpm);
    
    return {
      intervals: rrIntervals,
      lastPeakTime: this.lastPeakTime
    };
  }
}
