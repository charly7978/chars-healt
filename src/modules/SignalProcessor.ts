import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  private R: number = 0.01;  // Ruido de medición (ajustado)
  private Q: number = 0.08;  // Ruido de proceso (reducido para mejor estabilidad)
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

export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 20,           // Aumentado para mejor análisis
    MIN_RED_THRESHOLD: 35,     // Reducido para mayor sensibilidad
    MAX_RED_THRESHOLD: 255,    // Aumentado para captar señales más fuertes
    STABILITY_WINDOW: 8,       // Aumentado para mejor análisis
    MIN_STABILITY_COUNT: 5,    // Aumentado para confirmación más robusta
    HYSTERESIS: 8,             // Aumentado para evitar fluctuaciones
    MIN_CONSECUTIVE_DETECTIONS: 4,  // Aumentado para reducir falsos positivos
    RED_DOMINANCE_FACTOR: 1.25,    // Nuevo: factor para determinar dominancia del rojo
    STABILITY_THRESHOLD: 0.75,     // Nuevo: umbral para considerar señal estable
    QUALITY_DECAY_FACTOR: 0.92,    // Nuevo: factor de decaimiento para calidad
    SIGNAL_VARIANCE_THRESHOLD: 0.05 // Nuevo: umbral de varianza para señal válida
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 600; // Aumentado a 600ms
  private qualityHistory: number[] = [];    // Nuevo: historial de calidad
  private varianceBuffer: number[] = [];    // Nuevo: buffer para calcular varianza
  private redDominanceHistory: boolean[] = []; // Nuevo: historial de dominancia del rojo

  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instancia creada");
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.consecutiveDetections = 0;
      this.isCurrentlyDetected = false;
      this.lastDetectionTime = 0;
      this.qualityHistory = [];
      this.varianceBuffer = [];
      this.redDominanceHistory = [];
      this.kalmanFilter.reset();
      console.log("PPGSignalProcessor: Inicializado");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("PPGSignalProcessor: Iniciado");
  }

  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.qualityHistory = [];
    this.varianceBuffer = [];
    this.redDominanceHistory = [];
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await this.initialize();
      console.log("PPGSignalProcessor: Calibración completada");
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      console.log("PPGSignalProcessor: No está procesando");
      return;
    }

    try {
      // Extracción mejorada de la señal PPG
      const { redValue, isRedDominant, redRatio } = this.extractRedChannel(imageData);
      
      // Actualizar historial de dominancia del rojo
      this.redDominanceHistory.push(isRedDominant);
      if (this.redDominanceHistory.length > 10) {
        this.redDominanceHistory.shift();
      }
      
      // Aplicar filtro Kalman para suavizar la señal
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }
      
      // Actualizar buffer de varianza
      this.varianceBuffer.push(filtered);
      if (this.varianceBuffer.length > 15) {
        this.varianceBuffer.shift();
      }

      // Análisis mejorado de la señal
      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue, isRedDominant, redRatio);

      // Actualizar historial de calidad
      this.qualityHistory.push(quality);
      if (this.qualityHistory.length > 10) {
        this.qualityHistory.shift();
      }

      console.log("PPGSignalProcessor: Análisis", {
        redValue,
        filtered,
        isFingerDetected,
        quality,
        stableFrames: this.stableFrameCount,
        redDominant: isRedDominant,
        redRatio
      });

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue)
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): { redValue: number, isRedDominant: boolean, redRatio: number } {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    
    // Usar región central para mejor señal (30% del centro)
    const startX = Math.floor(imageData.width * 0.35);
    const endX = Math.floor(imageData.width * 0.65);
    const startY = Math.floor(imageData.height * 0.35);
    const endY = Math.floor(imageData.height * 0.65);
    
    // Muestreo optimizado para rendimiento y precisión
    const sampleStep = Math.max(1, Math.floor((endX - startX) * (endY - startY) / 12000));
    
    // Acumuladores para análisis de varianza (importante para SpO2)
    let redSquaredSum = 0;
    let redGreenRatioSum = 0;
    let redBlueRatioSum = 0;
    
    for (let y = startY; y < endY; y += sampleStep) {
      for (let x = startX; x < endX; x += sampleStep) {
        const i = (y * imageData.width + x) * 4;
        const r = data[i];     // Canal rojo
        const g = data[i+1];   // Canal verde
        const b = data[i+2];   // Canal azul
        
        redSum += r;
        greenSum += g;
        blueSum += b;
        
        // Acumular datos para análisis de varianza
        redSquaredSum += r * r;
        
        // Calcular ratios por pixel (importante para SpO2)
        if (g > 0) redGreenRatioSum += r / g;
        if (b > 0) redBlueRatioSum += r / b;
        
        count++;
      }
    }
    
    if (count === 0) return { redValue: 0, isRedDominant: false, redRatio: 0 };
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;
    
    // Calcular varianza del canal rojo (importante para calidad de señal)
    const redVariance = (redSquaredSum / count) - (avgRed * avgRed);
    
    // Verificar dominancia del canal rojo con criterios mejorados
    const redToGreenRatio = avgRed / (avgGreen || 1);
    const redToBlueRatio = avgRed / (avgBlue || 1);
    
    // Criterios más precisos para detección de tejido con sangre
    const isRedDominant = 
      redToGreenRatio > this.currentConfig.RED_DOMINANCE_FACTOR && 
      redToBlueRatio > this.currentConfig.RED_DOMINANCE_FACTOR &&
      redVariance > 5; // Debe haber cierta varianza en el canal rojo
    
    // Calcular ratio promedio para análisis de calidad y SpO2
    const pixelRedRatio = (redGreenRatioSum + redBlueRatioSum) / (2 * count);
    const redRatio = (redToGreenRatio + redToBlueRatio) / 2;
    
    // Valor ajustado para mejor precisión en SpO2
    const adjustedRedValue = isRedDominant ? 
      avgRed * (1 + Math.min(0.2, Math.sqrt(redVariance) / 100)) : 0;
    
    return { 
      redValue: adjustedRedValue, 
      isRedDominant, 
      redRatio: pixelRedRatio > 0 ? pixelRedRatio : redRatio 
    };
  }

  private analyzeSignal(
    filtered: number, 
    rawValue: number, 
    isRedDominant: boolean,
    redRatio: number
  ): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Verificar consistencia de dominancia del rojo (indicador clave de presencia de dedo)
    const redDominanceConsistency = this.redDominanceHistory.filter(Boolean).length / 
                                   Math.max(1, this.redDominanceHistory.length);
    
    // Verificar si el valor está dentro del rango válido con histéresis mejorada
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS) &&
        redDominanceConsistency > 0.7
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD &&
        redDominanceConsistency > 0.8;

    if (!inRange) {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analizar estabilidad de la señal con métodos mejorados
    const stability = this.calculateStability();
    const variance = this.calculateVariance();
    
    // Verificar si la señal tiene suficiente varianza (indicador de pulso)
    const hasAdequateVariance = variance > this.currentConfig.SIGNAL_VARIANCE_THRESHOLD;
    
    if (stability > this.currentConfig.STABILITY_THRESHOLD && hasAdequateVariance) {
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 0.5);
    }

    // Actualizar estado de detección con criterios más robustos
    const wasDetected = this.isCurrentlyDetected;
    const isStableNow = this.stableFrameCount >= this.currentConfig.MIN_STABILITY_COUNT;

    if (isStableNow && isRedDominant && redRatio > 1.3) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.currentConfig.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 0.5);
      if (this.consecutiveDetections === 0 && timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
    }

    // Calcular calidad de la señal con múltiples factores
    const stabilityScore = Math.min(1, this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2));
    const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                  (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
    const varianceScore = Math.min(variance / (this.currentConfig.SIGNAL_VARIANCE_THRESHOLD * 3), 1);
    const redDominanceScore = Math.min((redRatio - 1) / 0.5, 1);
    
    // Combinar factores con pesos optimizados
    const rawQuality = Math.round(
      (stabilityScore * 0.35 + 
       intensityScore * 0.25 + 
       varianceScore * 0.25 + 
       redDominanceScore * 0.15) * 100
    );
    
    // Suavizar calidad para evitar fluctuaciones
    const smoothedQuality = this.calculateSmoothedQuality(rawQuality);
    
    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? smoothedQuality : 0
    };
  }

  private calculateStability(): number {
    if (this.lastValues.length < 3) return 0;
    
    // Cálculo de estabilidad mejorado basado en tendencia y variación
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    
    // Analizar tendencia (pendiente)
    const firstHalf = this.lastValues.slice(0, Math.floor(this.lastValues.length / 2));
    const secondHalf = this.lastValues.slice(Math.floor(this.lastValues.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    // Penalizar cambios bruscos de tendencia
    const trendPenalty = Math.abs(secondAvg - firstAvg) > 30 ? 0.3 : 0;
    
    return Math.max(0, Math.min(1, 1 - (avgVariation / 40) - trendPenalty));
  }

  private calculateVariance(): number {
    if (this.varianceBuffer.length < 5) return 0;
    
    const mean = this.varianceBuffer.reduce((sum, val) => sum + val, 0) / this.varianceBuffer.length;
    
    const squaredDiffs = this.varianceBuffer.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
    
    return variance;
  }

  private calculateSmoothedQuality(rawQuality: number): number {
    if (this.qualityHistory.length === 0) return rawQuality;
    
    // Calcular promedio ponderado dando más peso a valores recientes
    let weightedSum = rawQuality; // El valor actual tiene peso 1
    let weightSum = 1;
    
    for (let i = this.qualityHistory.length - 1; i >= 0; i--) {
      const weight = this.currentConfig.QUALITY_DECAY_FACTOR ** (this.qualityHistory.length - i);
      weightedSum += this.qualityHistory[i] * weight;
      weightSum += weight;
    }
    
    return Math.round(weightedSum / weightSum);
  }

  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // ROI adaptativa basada en la intensidad de la señal
    const size = Math.min(100, Math.max(50, Math.round(redValue / 2)));
    
    return {
      x: 0,
      y: 0,
      width: size,
      height: size
    };
  }

  private handleError(code: string, message: string): void {
    console.error("PPGSignalProcessor: Error", code, message);
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    this.onError?.(error);
  }
}
