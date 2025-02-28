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

export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 60,           // Optimizado para mejor análisis
    MIN_RED_THRESHOLD: 20,     // Reducido para mejor sensibilidad
    MAX_RED_THRESHOLD: 255,    // Máximo valor posible
    STABILITY_WINDOW: 20,      // Aumentado para mejor estabilidad
    MIN_STABILITY_COUNT: 10,   // Aumentado para reducir falsos positivos
    HYSTERESIS: 18,           // Aumentado para mejor estabilidad
    MIN_CONSECUTIVE_DETECTIONS: 8  // Aumentado para mayor robustez
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 350;     // Optimizado para respuesta más rápida
  private readonly MIN_SIGNAL_AMPLITUDE = 0.12; // Ajustado para mejor sensibilidad
  private readonly QUALITY_THRESHOLD = 0.70;    // Aumentado para mayor precisión

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
      // Extracción de la señal PPG basada en evidencia científica
      // Remenyi et al. (2015) - "Accurate non-contact pulse rate measurement using mobile camera"
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      console.log("PPGSignalProcessor: Análisis", {
        redValue,
        filtered,
        isFingerDetected,
        quality,
        stableFrames: this.stableFrameCount
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

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    
    // Usar región central más pequeña (25% del centro) para mejor señal
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];     // Canal rojo
        greenSum += data[i+1]; // Canal verde
        blueSum += data[i+2];  // Canal azul
        count++;
      }
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Mejorada la detección de tejido con sangre
    const isRedDominant = avgRed > (avgGreen * 1.5) && avgRed > (avgBlue * 1.5);
    const hasGoodIntensity = avgRed > this.currentConfig.MIN_RED_THRESHOLD;
    
    return (isRedDominant && hasGoodIntensity) ? avgRed : 0;
  }

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Verificación mejorada del rango válido con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD;

    if (!inRange) {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { 
        isFingerDetected: this.isCurrentlyDetected, 
        quality: this.isCurrentlyDetected ? Math.max(0, this.stableFrameCount * 10) : 0 
      };
    }

    // Análisis de estabilidad mejorado
    const stability = this.calculateStability();
    if (stability > 0.8) { // Aumentado el umbral de estabilidad
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 0.5);
    }

    // Actualización mejorada del estado de detección
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
    }

    // Cálculo mejorado de la calidad de señal
    const stabilityScore = Math.pow(this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2), 1.5);
    const intensityScore = Math.min(
      (rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
      (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 
      1
    );
    
    // Ponderación ajustada para favorecer la estabilidad
    const quality = Math.round((stabilityScore * 0.7 + intensityScore * 0.3) * 100);

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  private calculateStability(): number {
    if (this.lastValues.length < 2) return 0;
    
    // Cálculo mejorado de estabilidad
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    const maxVariation = Math.max(...variations);
    
    // Combinar variación promedio y máxima para mejor estabilidad
    const stabilityScore = 1 - (avgVariation / 50) * 0.7 - (maxVariation / 100) * 0.3;
    return Math.max(0, Math.min(1, stabilityScore));
  }

  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // Región de interés constante para simplificar
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
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
