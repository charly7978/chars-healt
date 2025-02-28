import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  private R: number = 0.01;  // Ruido de medición (ajustado para mejor rendimiento)
  private Q: number = 0.08;  // Ruido del proceso (reducido para mayor estabilidad)
  private P: number = 1;     // Estimación inicial de error
  private X: number = 0;     // Estado inicial
  private K: number = 0;     // Ganancia de Kalman

  filter(measurement: number): number {
    // Predicción
    this.P = this.P + this.Q;
    
    // Actualización
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
    BUFFER_SIZE: 18,           // Aumentado para mejor análisis de señal
    MIN_RED_THRESHOLD: 35,     // Reducido para mayor sensibilidad
    MAX_RED_THRESHOLD: 255,    // Aumentado para captar señal más intensa
    STABILITY_WINDOW: 8,       // Aumentado para análisis de estabilidad más robusto
    MIN_STABILITY_COUNT: 4,    // Mínimo de muestras estables
    HYSTERESIS: 8,             // Aumentado para evitar fluctuaciones en detección
    MIN_CONSECUTIVE_DETECTIONS: 3,  // Mínimo de detecciones consecutivas necesarias
    RED_DOMINANCE_FACTOR: 1.15,    // Reducido para mayor sensibilidad
    STABILITY_THRESHOLD: 0.65,     // Umbral para considerar señal estable
    INTENSITY_WEIGHT: 0.45,        // Peso de intensidad en cálculo de calidad
    STABILITY_WEIGHT: 0.55         // Peso de estabilidad en cálculo de calidad
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 600; // Aumentado para mayor estabilidad
  private signalQualityHistory: number[] = []; // Historial de calidad de señal
  private redValueHistory: number[] = []; // Historial de valores rojos
  private adaptiveMinThreshold: number; // Umbral mínimo adaptativo
  private adaptiveMaxThreshold: number; // Umbral máximo adaptativo
  private readonly ADAPTIVE_THRESHOLD_ALPHA = 0.15; // Factor de adaptación de umbrales

  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    this.adaptiveMinThreshold = this.currentConfig.MIN_RED_THRESHOLD;
    this.adaptiveMaxThreshold = this.currentConfig.MAX_RED_THRESHOLD;
    console.log("PPGSignalProcessor: Instancia creada con configuración optimizada");
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.consecutiveDetections = 0;
      this.isCurrentlyDetected = false;
      this.lastDetectionTime = 0;
      this.signalQualityHistory = [];
      this.redValueHistory = [];
      this.adaptiveMinThreshold = this.currentConfig.MIN_RED_THRESHOLD;
      this.adaptiveMaxThreshold = this.currentConfig.MAX_RED_THRESHOLD;
      this.kalmanFilter.reset();
      console.log("PPGSignalProcessor: Inicializado con parámetros optimizados");
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
    this.signalQualityHistory = [];
    this.redValueHistory = [];
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await this.initialize();
      
      // Reiniciar umbrales adaptativos a valores por defecto
      this.adaptiveMinThreshold = this.currentConfig.MIN_RED_THRESHOLD;
      this.adaptiveMaxThreshold = this.currentConfig.MAX_RED_THRESHOLD;
      
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
      // Extracción optimizada de la señal PPG
      const { redValue, redDominance } = this.extractRedChannel(imageData);
      
      // Aplicar filtro de Kalman para suavizar la señal
      const filtered = this.kalmanFilter.filter(redValue);
      
      // Almacenar valor filtrado para análisis
      this.lastValues.push(filtered);
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }
      
      // Almacenar valor rojo para análisis de umbrales adaptativos
      this.redValueHistory.push(redValue);
      if (this.redValueHistory.length > 30) { // Mantener historial de 30 frames
        this.redValueHistory.shift();
      }

      // Actualizar umbrales adaptativos si tenemos suficientes datos
      if (this.redValueHistory.length >= 15) {
        this.updateAdaptiveThresholds();
      }

      // Analizar señal con umbrales adaptativos
      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue, redDominance);
      
      // Almacenar calidad para análisis de tendencia
      if (isFingerDetected) {
        this.signalQualityHistory.push(quality);
        if (this.signalQualityHistory.length > 10) {
          this.signalQualityHistory.shift();
        }
      }

      // Calcular calidad de tendencia (más estable)
      const trendQuality = this.calculateTrendQuality(quality);

      console.log("PPGSignalProcessor: Análisis", {
        redValue,
        filtered,
        isFingerDetected,
        quality: trendQuality,
        stableFrames: this.stableFrameCount,
        adaptiveMin: Math.round(this.adaptiveMinThreshold),
        adaptiveMax: Math.round(this.adaptiveMaxThreshold)
      });

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: trendQuality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue)
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): { redValue: number, redDominance: boolean } {
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
    
    // Muestreo optimizado para rendimiento (no procesar todos los píxeles)
    const sampleStep = Math.max(1, Math.floor((endX - startX) * (endY - startY) / 10000));
    
    for (let y = startY; y < endY; y += sampleStep) {
      for (let x = startX; x < endX; x += sampleStep) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];     // Canal rojo
        greenSum += data[i+1]; // Canal verde
        blueSum += data[i+2];  // Canal azul
        count++;
      }
    }
    
    if (count === 0) return { redValue: 0, redDominance: false };
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Verificar dominancia del canal rojo (característico de la presencia de tejido con sangre)
    const redDominanceFactor = this.currentConfig.RED_DOMINANCE_FACTOR;
    const isRedDominant = avgRed > (avgGreen * redDominanceFactor) && 
                          avgRed > (avgBlue * redDominanceFactor);
    
    return { 
      redValue: isRedDominant ? avgRed : 0,
      redDominance: isRedDominant
    };
  }

  private updateAdaptiveThresholds(): void {
    if (this.redValueHistory.length < 15) return;
    
    // Ordenar valores para análisis estadístico
    const sortedValues = [...this.redValueHistory].sort((a, b) => a - b);
    
    // Usar percentiles para determinar umbrales adaptativos
    const p10 = sortedValues[Math.floor(sortedValues.length * 0.1)];
    const p90 = sortedValues[Math.floor(sortedValues.length * 0.9)];
    
    // Actualizar umbrales con suavizado exponencial
    this.adaptiveMinThreshold = this.adaptiveMinThreshold * (1 - this.ADAPTIVE_THRESHOLD_ALPHA) + 
                               Math.max(this.currentConfig.MIN_RED_THRESHOLD * 0.8, p10) * this.ADAPTIVE_THRESHOLD_ALPHA;
    
    this.adaptiveMaxThreshold = this.adaptiveMaxThreshold * (1 - this.ADAPTIVE_THRESHOLD_ALPHA) + 
                               Math.min(this.currentConfig.MAX_RED_THRESHOLD, p90 * 1.1) * this.ADAPTIVE_THRESHOLD_ALPHA;
  }

  private analyzeSignal(filtered: number, rawValue: number, redDominance: boolean): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Si no hay dominancia de rojo, no hay dedo
    if (!redDominance) {
      this.consecutiveDetections = 0;
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }
    
    // Verificar si el valor está dentro del rango válido con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.adaptiveMinThreshold - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.adaptiveMaxThreshold + this.currentConfig.HYSTERESIS)
      : rawValue >= this.adaptiveMinThreshold &&
        rawValue <= this.adaptiveMaxThreshold;

    if (!inRange) {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analizar estabilidad de la señal con método mejorado
    const stability = this.calculateStability();
    if (stability > this.currentConfig.STABILITY_THRESHOLD) {
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

    if (isStableNow) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.currentConfig.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      if (this.consecutiveDetections === 0 && timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
    }

    // Calcular calidad de la señal con método mejorado
    const stabilityScore = Math.min(1, this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2));
    
    // Calcular score de intensidad normalizado al rango adaptativo
    const intensityScore = Math.min(
      Math.max(
        (rawValue - this.adaptiveMinThreshold) / 
        (this.adaptiveMaxThreshold - this.adaptiveMinThreshold), 
        0
      ), 
      1
    );
    
    // Calcular calidad ponderada
    const quality = Math.round(
      (stabilityScore * this.currentConfig.STABILITY_WEIGHT + 
       intensityScore * this.currentConfig.INTENSITY_WEIGHT) * 100
    );

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  private calculateStability(): number {
    if (this.lastValues.length < 3) return 0;
    
    // Cálculo de estabilidad mejorado basado en variaciones relativas
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i]) / Math.max(1, this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    
    // Convertir a score de estabilidad (menor variación = mayor estabilidad)
    return Math.max(0, Math.min(1, 1 - (avgVariation * 20)));
  }

  private calculateTrendQuality(currentQuality: number): number {
    // Si no hay historial, usar calidad actual
    if (this.signalQualityHistory.length === 0) {
      return currentQuality;
    }
    
    // Calcular calidad promedio con mayor peso a valores recientes
    let weightedSum = currentQuality * 2; // Doble peso al valor actual
    let weightSum = 2;
    
    for (let i = this.signalQualityHistory.length - 1; i >= 0; i--) {
      const weight = 1 + (i / this.signalQualityHistory.length); // Peso decreciente con antigüedad
      weightedSum += this.signalQualityHistory[i] * weight;
      weightSum += weight;
    }
    
    return Math.round(weightedSum / weightSum);
  }

  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // Región de interés adaptativa basada en la intensidad de la señal
    const size = Math.max(50, Math.min(100, redValue / 2));
    
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
