<lov-code>
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  private R: number = 0.01;
  private Q: number = 0.1;
  private P: number = 1;
  private X: number = 0;
  private K: number = 0;

  filter(measurement: number): number {
    this.P = this.P + this.Q;
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    return this.X;
  }

  reset() {
    this.X = 0;
    this.P = 1;
  }
}

export class HeartBeatProcessor {
  // ────────── CONFIGURACIÓN AVANZADA ──────────
  // Basado en las últimas investigaciones de procesamiento de señales PPG
  
  // Parámetros principales - optimizados para procesamiento con cámara de móvil
  private readonly SAMPLE_RATE = 30; // Frecuencia típica de cámaras móviles
  private readonly WINDOW_SIZE = 90; // 3 segundos a 30fps - ideal para análisis
  private readonly MIN_BPM = 40;  // Límite clínico inferior para adultos
  private readonly MAX_BPM = 220; // Frecuencia cardíaca fisiológica máxima
  
  // Parámetros de calidad de señal
  private readonly MIN_CONFIDENCE = 0.5; // Umbral más alto para detección confiable
  private readonly SIGNAL_THRESHOLD = 0.25; // Umbral adaptativo basado en fuerza de señal
  private readonly NOISE_THRESHOLD = 0.15; // Para detectar señales ruidosas
  
  // Parámetros de detección de picos - implementando conceptos del algoritmo Pan-Tompkins
  private readonly DERIVATIVE_THRESHOLD = -0.002; // Umbral para primera derivada
  private readonly MIN_PEAK_TIME_MS = 250; // Tiempo mínimo fisiológico entre picos
  private readonly WARMUP_TIME_MS = 1500; // Tiempo de estabilización del sistema
  private readonly PEAK_AGE_WEIGHT = 0.7; // Mayor peso a picos recientes
  
  // Parámetros de filtrado - enfoque de filtrado multi-etapa
  private readonly MEDIAN_FILTER_WINDOW = 5; // Elimina ruido impulsivo eficazmente
  private readonly BUTTERWORTH_LOW_PASS = 3.5; // Hz - Elimina ruido de alta frecuencia
  private readonly BUTTERWORTH_HIGH_PASS = 0.5; // Hz - Elimina deriva de línea base
  private readonly BUTTERWORTH_ORDER = 2; // Orden del filtro - balance entre nitidez y oscilación
  private readonly MOVING_AVERAGE_WINDOW = 3; // Etapa final de suavizado
  private readonly EMA_ALPHA = 0.3; // Factor de promedio móvil exponencial
  private readonly BASELINE_ALPHA = 0.02; // Adaptación de línea base más lenta
  
  // Parámetros de retroalimentación de audio
  private readonly BEEP_PRIMARY_FREQUENCY = 800; // Hz - Más agradable que frecuencias más altas
  private readonly BEEP_SECONDARY_FREQUENCY = 400; // Hz - Armónico secundario
  private readonly BEEP_DURATION = 70; // ms - Lo suficientemente corto para no molestar
  private readonly BEEP_VOLUME = 0.75; // Volumen moderado
  private readonly MIN_BEEP_INTERVAL_MS = 250; // Prevenir superposición de beeps
  private readonly BEEP_ENVELOPE_RISE = 0.01; // seg - Ataque suave para evitar clics
  private readonly BEEP_ENVELOPE_FALL = 0.05; // seg - Liberación suave
  
  // Parámetros de detección de arritmia
  private readonly RR_BUFFER_SIZE = 16; // Almacenar más intervalos RR para mejor análisis
  private readonly HR_VAR_THRESHOLD = 12; // % de varianza para detección de arritmia
  private readonly CONSECUTIVE_IRREGULAR_BEATS = 2; // Número de latidos irregulares antes de alerta
  private readonly PREMATURE_BEAT_THRESHOLD = 0.8; // % del intervalo RR promedio
  
  // Parámetros de auto-reset para control de calidad de señal
  private readonly LOW_SIGNAL_THRESHOLD = 0.04;
  private readonly LOW_SIGNAL_FRAMES = 15;
  private readonly MAX_SIGNAL_AGE_MS = 10000; // Reset si no hay nuevos picos por 10 segundos
  
  // ────────── VARIABLES DE ESTADO ──────────
  // Buffers de señal y estado de procesamiento
  private signalBuffer: number[] = [];
  private medianBuffer: number[] = [];
  private movingAverageBuffer: number[] = [];
  private lowPassBuffer: number[] = [];
  private highPassBuffer: number[] = [];
  private smoothedValue: number = 0;
  private baseline: number = 0;
  private lastValue: number = 0;
  private values: number[] = [];
  private startTime: number = 0;
  private lastSignalTime: number = 0;
  private lowSignalCount = 0;
  
  // Estado de detección de picos
  private lastPeakTime: number | null = null;
  private previousPeakTime: number | null = null;
  private peakConfirmationBuffer: number[] = [];
  private lastConfirmedPeak: boolean = false;
  private peakCandidateIndex: number | null = null;
  private peakCandidateValue: number = 0;
  private peakThreshold: number = 0;
  private adaptiveThreshold: number = 0;
  private signalQuality: number = 0;
  
  // Cálculo de frecuencia cardíaca
  private bpmHistory: number[] = [];
  private rrIntervals: number[] = [];
  private smoothBPM: number = 0;
  private readonly BPM_ALPHA = 0.2; // Factor de suavizado para actualizaciones de BPM
  
  // Detección de arritmia
  private irregularBeatCount: number = 0;
  private consecutiveIrregularBeats: number = 0;
  private arrhythmiaDetected: boolean = false;
  private arrythmiaRiskScore: number = 0;
  
  // Contexto de audio
  private audioContext: AudioContext | null = null;
  private lastBeepTime = 0;
  
  // ────────── COEFICIENTES DE FILTRO BUTTERWORTH ──────────
  // Coeficientes precalculados para filtro Butterworth de 2º orden a 30Hz
  // Paso bajo con corte en 3.5Hz
  private readonly LP_A = [1, -1.7236056, 0.7600501];
  private readonly LP_B = [0.0091334, 0.0182668, 0.0091334];
  
  // Paso alto con corte en 0.5Hz
  private readonly HP_A = [1, -1.9556093, 0.9565925];
  private readonly HP_B = [0.9776399, -1.9552798, 0.9776399];
  
  constructor() {
    this.initAudio();
    this.reset();
  }
  
  private async initAudio() {
    try {
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      // Prueba con beep casi silencioso para asegurar que el audio está inicializado
      await this.playBeep(0.01);
      console.log("HeartBeatProcessor: Audio Context Inicializado");
    } catch (error) {
      console.error("HeartBeatProcessor: Error inicializando audio", error);
    }
  }
  
  private async playBeep(volume: number = this.BEEP_VOLUME) {
    if (!this.audioContext || this.isInWarmup()) return;
    
    const now = Date.now();
    if (now - this.lastBeepTime < this.MIN_BEEP_INTERVAL_MS) return;
    
    try {
      // Crear osciladores primario y secundario para un sonido más agradable
      const primaryOscillator = this.audioContext.createOscillator();
      const primaryGain = this.audioContext.createGain();
      
      const secondaryOscillator = this.audioContext.createOscillator();
      const secondaryGain = this.audioContext.createGain();
      
      // Configurar osciladores
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
      
      // Aplicar envolvente de volumen para tono primario
      primaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      primaryGain.gain.linearRampToValueAtTime(
        volume,
        this.audioContext.currentTime + this.BEEP_ENVELOPE_RISE
      );
      primaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000 + this.BEEP_ENVELOPE_FALL
      );
      
      // Aplicar envolvente de volumen para tono secundario
      secondaryGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      secondaryGain.gain.linearRampToValueAtTime(
        volume * 0.3, // Tono secundario más silencioso
        this.audioContext.currentTime + this.BEEP_ENVELOPE_RISE
      );
      secondaryGain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + this.BEEP_DURATION / 1000 + this.BEEP_ENVELOPE_FALL
      );
      
      // Conectar el grafo de audio
      primaryOscillator.connect(primaryGain);
      secondaryOscillator.connect(secondaryGain);
      primaryGain.connect(this.audioContext.destination);
      secondaryGain.connect(this.audioContext.destination);
      
      // Iniciar y detener los osciladores
      const startTime = this.audioContext.currentTime;
      const stopTime = startTime + this.BEEP_DURATION / 1000 + this.BEEP_ENVELOPE_FALL + 0.01;
      
      primaryOscillator.start(startTime);
      secondaryOscillator.start(startTime);
      
      primaryOscillator.stop(stopTime);
      secondaryOscillator.stop(stopTime);
      
      this.lastBeepTime = now;
    } catch (error) {
      console.error("HeartBeatProcessor: Error reproduciendo beep", error);
    }
  }
  
  private isInWarmup(): boolean {
    return Date.now() - this.startTime < this.WARMUP_TIME_MS;
  }
  
  /**
   * Aplicar filtro de mediana para eliminar valores atípicos y ruido impulsivo
   */
  private medianFilter(value: number): number {
    this.medianBuffer.push(value);
    if (this.medianBuffer.length > this.MEDIAN_FILTER_WINDOW) {
      this.medianBuffer.shift();
    }
    
    // Ordenar valores y obtener el del medio
    const sorted = [...this.medianBuffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  
  /**
   * Aplicar filtro de paso bajo Butterworth
   * Implementación de un filtro IIR digital
   */
  private lowPassFilter(value: number): number {
    // Asegurar que el buffer esté inicializado correctamente
    while (this.lowPassBuffer.length < Math.max(this.LP_A.length, this.LP_B.length)) {
      this.lowPassBuffer.unshift(value);
    }
    
    // Calcular valor filtrado usando ecuación de diferencias
    let output = 0;
    
    // Aplicar componentes de feedforward (coeficientes B)
    for (let i = 0; i < this.LP_B.length; i++) {
      if (i === 0) {
        output += this.LP_B[i] * value;
      } else if (i < this.lowPassBuffer.length) {
        output += this.LP_B[i] * this.lowPassBuffer[i-1];
      }
    }
    
    // Aplicar componentes de feedback (coeficientes A, saltando A[0] que siempre es 1)
    for (let i = 1; i < this.LP_A.length; i++) {
      if (i < this.lowPassBuffer.length) {
        output -= this.LP_A[i] * this.lowPassBuffer[i-1];
      }
    }
    
    // Actualizar el buffer
    this.lowPassBuffer.unshift(output);
    if (this.lowPassBuffer.length > Math.max(this.LP_A.length, this.LP_B.length)) {
      this.lowPassBuffer.pop();
    }
    
    return output;
  }
  
  /**
   * Aplicar filtro de paso alto Butterworth para eliminar deriva de línea base
   */
  private highPassFilter(value: number): number {
    // Asegurar que el buffer esté inicializado correctamente
    while (this.highPassBuffer.length < Math.max(this.HP_A.length, this.HP_B.length)) {
      this.highPassBuffer.unshift(value);
    }
    
    // Calcular valor filtrado usando ecuación de diferencias
    let output = 0;
    
    // Aplicar componentes de feedforward (coeficientes B)
    for (let i = 0; i < this.HP_B.length; i++) {
      if (i === 0) {
        output += this.HP_B[i] * value;
      } else if (i < this.highPassBuffer.length) {
        output += this.HP_B[i] * this.highPassBuffer[i-1];
      }
    }
    
    // Aplicar componentes de feedback (coeficientes A, saltando A[0] que siempre es 1)
    for (let i = 1; i < this.HP_A.length; i++) {
      if (i < this.highPassBuffer.length) {
        output -= this.HP_A[i] * this.highPassBuffer[i-1];
      }
    }
    
    // Actualizar el buffer
    this.highPassBuffer.unshift(output);
    if (this.highPassBuffer.length > Math.max(this.HP_A.length, this.HP_B.length)) {
      this.highPassBuffer.pop();
    }
    
    return output;
  }
  
  /**
   * Aplicar filtro de promedio móvil para suavizado final
   */
  private calculateMovingAverage(value: number): number {
    this.movingAverageBuffer.push(value);
    if (this.movingAverageBuffer.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverageBuffer.shift();
    }
    
    const sum = this.movingAverageBuffer.reduce((a, b) => a + b, 0);
    return sum / this.movingAverageBuffer.length;
  }
  
  /**
   * Aplicar promedio móvil exponencial para transiciones más suaves
   */
  private calculateEMA(value: number): number {
    this.smoothedValue = this.EMA_ALPHA * value + (1 - this.EMA_ALPHA) * this.smoothedValue;
    return this.smoothedValue;
  }
  
  /**
   * Función principal de procesamiento de señal - aplica pipeline completo de filtrado
   */
  public processSignal(value: number): {
    bpm: number;
    confidence: number;
    isPeak: boolean;
    filteredValue: number;
    arrhythmiaCount: number;
  } {
    this.lastSignalTime = Date.now();
    
    // Pipeline completo de procesamiento de señal
    // 1. Filtro de mediana - eliminar valores atípicos
    const medVal = this.medianFilter(value);
    
    // 2. Filtrado de banda (vía paso alto y paso bajo separados)
    const highpassed = this.highPassFilter(medVal);
    const bandpassed = this.lowPassFilter(highpassed);
    
    // 3. Suavizado de promedio móvil
    const movAvgVal = this.calculateMovingAverage(bandpassed);
    
    // 4. Promedio móvil exponencial para suavizado final
    const smoothed = this.calculateEMA(movAvgVal);
    
    // Almacenar valores para análisis
    this.signalBuffer.push(smoothed);
    if (this.signalBuffer.length > this.WINDOW_SIZE) {
      this.signalBuffer.shift();
    }
    
    // Verificar si tenemos suficientes datos para análisis
    if (this.signalBuffer.length < Math.floor(this.WINDOW_SIZE / 3)) {
      return {
        bpm: 0,
        confidence: 0,
        isPeak: false,
        filteredValue: smoothed,
        arrhythmiaCount: 0
      };
    }
    
    // Calcular calidad de señal
    this.updateSignalQuality();
    
    // Actualizar línea base adaptativa
    this.baseline = (1 - this.BASELINE_ALPHA) * this.baseline + this.BASELINE_ALPHA * smoothed;
    
    // Normalizar la señal eliminando la línea base
    const normalizedValue = smoothed - this.baseline;
    
    // Auto-reset si la señal es muy baja por mucho tiempo
    this.autoResetIfSignalIsLow(Math.abs(normalizedValue));
    
    // Calcular primera derivada para detección de picos
    this.values.push(smoothed);
    if (this.values.length > 3) {
      this.values.shift();
    }
    
    // Calcular diferencia central para mejor aproximación de derivada
    let smoothDerivative = 0;
    if (this.values.length === 3) {
      smoothDerivative = (this.values[2] - this.values[0]) / 2;
    } else if (this.values.length === 2) {
      smoothDerivative = this.values[1] - this.values[0];
    }
    
    this.lastValue = smoothed;
    
    // Actualizar umbral adaptativo para detección de picos
    this.updateAdaptiveThreshold();
    
    // Detectar y confirmar picos
    const { isPeak, confidence } = this.detectPeak(normalizedValue, smoothDerivative);
    const isConfirmedPeak = this.confirmPeak(isPeak, normalizedValue, confidence);
    
    // Procesar picos confirmados
    if (isConfirmedPeak && !this.isInWarmup()) {
      const now = Date.now();
      const timeSinceLastPeak = this.lastPeakTime
        ? now - this.lastPeakTime
        : Number.MAX_VALUE;
      
      if (timeSinceLastPeak >= this.MIN_PEAK_TIME_MS) {
        this.previousPeakTime = this.lastPeakTime;
        this.lastPeakTime = now;
        
        // Reproducir tono para latido
        this.playBeep(Math.min(1.0, confidence * 1.2));
        
        // Actualizar BPM y verificar arritmias
        this.updateBPM();
        this.checkForArrhythmia();
      }
    }
    
    return {
      bpm: Math.round(this.getSmoothBPM()),
      confidence: Math.min(1, confidence * 1.2), // Escalar confianza pero limitar a 1
      isPeak: isConfirmedPeak && !this.isInWarmup(),
      filteredValue: smoothed,
      arrhythmiaCount: this.arrhythmiaDetected ? this.consecutiveIrregularBeats : 0
    };
  }
  
  /**
   * Calcular calidad de señal actual basada en múltiples factores
   */
  private updateSignalQuality(): void {
    if (this.signalBuffer.length < 30) {
      this.signalQuality = 0;
      return;
    }
    
    // Calcular varianza de señal como medida de actividad
    const mean = this.signalBuffer.reduce((sum, val) => sum + val, 0) / this.signalBuffer.length;
    const variance = this.signalBuffer.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this.signalBuffer.length;
    
    // Calcular relación señal-ruido
    const recentValues = this.signalBuffer.slice(-30);
    const recentMean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const signalPower = recentValues.reduce((sum, val) => sum + Math.pow(val - recentMean, 2), 0) / recentValues.length;
    
    // Calcular ruido muestra a muestra
    const diffSum = recentValues.slice(1).reduce((sum, val, i) => {
      return sum + Math.pow(val - recentValues[i], 2);
    }, 0);
    const noisePower = diffSum / (recentValues.length - 1);
    
    let snr = 0;
    if (noisePower > 0) {
      snr = 10 * Math.log10(signalPower / noisePower);
    }
    
    // Métrica de calidad de señal normalizada (0-1)
    const varianceQuality = Math.min(1, Math.max(0, (variance * 10000) / 2));
    const snrQuality = Math.min(1, Math.max(0, (snr + 10) / 30));
    
    // Estabilidad de BPM reciente
    let bpmStability = 0;
    if (this.bpmHistory.length >= 5) {
      const recent = this.bpmHistory.slice(-5);
      const bpmMean = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const bpmVariance = recent.reduce((sum, val) => sum + Math.pow(val - bpmMean, 2), 0) / recent.length;
      bpmStability = Math.min(1, Math.max(0, 1 - (bpmVariance / 100)));
    }
    
    // Puntuación de calidad combinada
    this.signalQuality = (varianceQuality * 0.3) + (snrQuality * 0.5) + (bpmStability * 0.2);
  }
  
  /**
   * Actualizar umbral adaptativo para detección de picos
   */
  private updateAdaptiveThreshold(): void {
    if (this.signalBuffer.length < 10) return;
    
    // Obtener valores de señal recientes
    const recentValues = this.signalBuffer.slice(-30);
    
    // Calcular la amplitud pico-a-pico
    const min = Math.min(...recentValues);
    const max = Math.max(...recentValues);
    const peakToPeak = max - min;
    
    // Ajustar umbral basado en valor pico-a-pico
    this.adaptiveThreshold = this.SIGNAL_THRESHOLD * (0.5 + (peakToPeak * 0.5));
    
    // Mantener umbral en límites razonables
    this.adaptiveThreshold = Math.max(0.1, Math.min(0.6, this.adaptiveThreshold));
  }
  
  /**
   * Auto-reset si la calidad de señal es muy baja por periodo extendido
   */
  private autoResetIfSignalIsLow(amplitude: number): void {
    if (amplitude < this.LOW_SIGNAL_THRESHOLD) {
      this.lowSignalCount++;
      if (this.lowSignalCount >= this.LOW_SIGNAL_FRAMES) {
        this.resetDetectionStates();
      }
    } else {
      this.lowSignalCount = Math.max(0, this.lowSignalCount - 1);
    }
    
    // También verificar datos obsoletos
    const now = Date.now();
    if (this.lastPeakTime && (now - this.lastPeakTime > this.MAX_SIGNAL_AGE_MS)) {
      console.log("HeartBeatProcessor: Señal muy antigua, reseteando");
      this.resetDetectionStates();
    }
  }
  
  /**
   * Resetear estado interno de detección (por problemas de calidad o timeout)
   */
  private resetDetectionStates(): void {
    this.lastPeakTime = null;
    this.previousPeakTime = null;
    this.lastConfirmedPeak = false;
    this.peakCandidateIndex = null;
    this.peakCandidateValue = 0;
    this.peakConfirmationBuffer = [];
    this.values = [];
    this.lowSignalCount = 0;
    
    // No resetear historial de BPM para evitar saltos
    console.log("HeartBeatProcessor: Reset estados de detección (problema de calidad de señal)");
  }
  
  /**
   * Detectar picos usando umbral adaptativo basado en el enfoque Pan-Tompkins
   */
  private detectPeak(normalizedValue: number, derivative: number): {
    isPeak: boolean;
    confidence: number;
  } {
    const now = Date.now();
    const timeSinceLastPeak = this.lastPeakTime
      ? now - this.lastPeakTime
      : Number.MAX_VALUE;
    
    // Imponer tiempo mínimo entre picos basado en límites fisiológicos
    if (timeSinceLastPeak < this.MIN_PEAK_TIME_MS) {
      return { isPeak: false, confidence: 0 };
    }
    
    // Detectar pico usando combinación de criterios de amplitud y derivada
    // Pendientes negativas (derivada < umbral) con señal sobre umbral
    const isOverThreshold =
      derivative < this.DERIVATIVE_THRESHOLD &&
      normalizedValue > this.adaptiveThreshold * 0.8 &&
      this.lastValue > this.baseline * 0.9;
    
    // Calcular confianza basada en múltiples factores
    const amplitudeConfidence = Math.min(
      Math.max(Math.abs(normalizedValue) / (this.adaptiveThreshold * 1.2), 0),
      1
    );
    
    const derivativeConfidence = Math.min(
      Math.max(Math.abs(derivative) / Math.abs(this.DERIVATIVE_THRESHOLD * 0.6), 0),
      1
    );
    
    // Calcular confianza de temporización - mayor si el tiempo está cerca de lo esperado
    let timingConfidence = 0;
    if (this.bpmHistory.length > 0) {
      const avgBPM = this.calculateCurrentBPM();
      if (avgBPM > 0) {
        const expectedInterval = 60000 / avgBPM;
        const intervalDifference = Math.abs(timeSinceLastPeak - expectedInterval);
        timingConfidence = Math.max(0, 1 - (intervalDifference / expectedInterval));
      }
    }
    
    // Puntuación de confianza ponderada
    const confidence = 
      (amplitudeConfidence * 0.6) + 
      (derivativeConfidence * 0.3) + 
      (timingConfidence * 0.1);
    
    if (isOverThreshold) {
      console.log("HeartBeatProcessor: Posible pico detectado", {
        normalizedValue,
        derivative,
        confidence,
        timeSinceLastPeak
      });
    }
    
    return { isPeak: isOverThreshold, confidence };
  }
  
  /**
   * Confirmar pico con reconocimiento de patrones para reducir falsos positivos
   */
  private confirmPeak(
    isPeak: boolean,
    normalizedValue: number,
    confidence: number
  ): boolean {
    // Añadir al buffer de confirmación para análisis de forma
    this.peakConfirmationBuffer.push(normalizedValue);
    if (this.peakConfirmationBuffer.length > 5) {
      this.peakConfirmationBuffer.shift();
    }
    
    // Solo procesar si es un pico candidato y la confianza es suficiente
    if (isPeak && !this.lastConfirmedPeak && confidence >= this.MIN_CONFIDENCE) {
      if (this.peakConfirmationBuffer.length >= 5) {
        const len = this.peakConfirmationBuffer.length;
        
        // Confirmar forma de pico: subida-subida-pico-bajada-bajada
        const risingEdge1 = this.peakConfirmationBuffer[len - 5] < this.peakConfirmationBuffer[len - 4];
        const risingEdge2 = this.peakConfirmationBuffer[len - 4] < this.peakConfirmationBuffer[len - 3];
        const fallingEdge1 = this.peakConfirmationBuffer[len - 3] > this.peakConfirmationBuffer[len - 2];
        const fallingEdge2 = this.peakConfirmationBuffer[len - 2] > this.peakConfirmationBuffer[len - 1];
        
        // Verificar forma característica de onda PPG - criterios más estrictos para confirmación
        if ((risingEdge1 || risingEdge2) && fallingEdge1 && fallingEdge2) {
          this.lastConfirmedPeak = true;
          return true;
        }
      }
    } else if (!isPeak) {
      this.lastConfirmedPeak = false;
    }
    
    return false;
  }
  
  /**
   * Actualizar cálculo de BPM con nuevo intervalo de pico
   */
  private updateBPM(): void {
    if (!this.lastPeakTime || !this.previousPeakTime) return;
    
    const interval = this.lastPeakTime - this.previousPeakTime;
    if (interval <= 0) return;
    
    const instantBPM = 60000 / interval;
    
    // Solo aceptar frecuencias cardíacas fisiológicamente plausibles
    if (instantBPM >= this.MIN_BPM && instantBPM <= this.MAX_BPM) {
      this.bpmHistory.push(instantBPM);
      
      // Almacenar intervalo RR para análisis de arritmia
      this.rrIntervals.push(interval);
      
      // Mantener tamaños de buffer razonables
      if (this.bpmHistory.length > this.RR_BUFFER_SIZE) {
        this.bpmHistory.shift();
      }
      
      if (this.rrIntervals.length > this.RR_BUFFER_SIZE) {
        this.rrIntervals.shift();
      }
    }
  }
  
  /**
   * Verificar arritmia basada en variabilidad de intervalo RR
   */
  private checkForArrhythmia(): void {
    if (this.rrIntervals.length < 6) return;
    
    // Obtener intervalos RR recientes
    const recentRR = this.rrIntervals.slice(-6);
    
    // Calcular promedio
    const avgRR = recentRR.reduce((sum, val) => sum + val, 0) / recentRR.length;
    
    // Calcular RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    
    // Calcular irregularidad RR
    const rrVariability = (rmssd / avgRR) * 100;
    
    // Verificar si el intervalo más reciente es significativamente más corto (latido prematuro)
    const latestRR = recentRR[recentRR.length - 1];
    const prematureBeat = latestRR < (avgRR * this.PREMATURE_BEAT_THRESHOLD);
    
    // Verificar condiciones de arritmia
    const isIrregular = rrVariability > this.HR_VAR_THRESHOLD || prematureBeat;
    
    if (isIrregular) {
      this.irregularBeatCount++;
      this.consecutiveIrregularBeats++;
      
      // Resetear contador consecutivo si tenemos suficientes latidos irregulares
      if (this.consecutiveIrregularBeats >= this.CONSECUTIVE_IRREGULAR_BEATS) {
        this.arrhythmiaDetected = true;
        this.arrythmiaRiskScore = Math.min(100, this.arrythmiaRiskScore + 25);
      }
    } else {
      this.consecutiveIrregularBeats = 0;
      this.arrythmiaRiskScore = Math.max(0, this.arrythmiaRiskScore - 5);
      
      if (this.arrythmiaRiskScore < 30) {
        this.arrhythmiaDetected = false;
      }
    }
  }
  
  /**
   * Obtener valor BPM suavizado
   */
  private getSmoothBPM(): number {
    const rawBPM = this.calculateCurrentBPM();
    if (this.smoothBPM === 0) {
      this.smoothBPM = rawBPM;
      return rawBPM;
    }
    
    // Aplicar suavizado exponencial
    this.smoothBPM = (1 - this.BPM_ALPHA) * this.smoothBPM + this.BPM_ALPHA * rawBPM;
    return this.smoothBPM;
  }
  
  /**
   * Calcular BPM actual desde historial
   */
  private calculateCurrentBPM(): number {
    if (this.bpmHistory.length < 3) {
      return 0;
    }
    
    // Usar media recortada para estabilidad (eliminar valores atípicos)
    const sorted = [...this.bpmHistory].sort((a, b) => a - b);
    const trimPercent = 0.2; // Eliminar 20% de cada extremo
    const trimCount = Math.floor(sorted.length * trimPercent);
    
    // Omitir recorte si no tenemos suficientes muestras
    const trimmed = sorted.length > 5 ? 
      
