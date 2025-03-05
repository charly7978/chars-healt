
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

// Class for Kalman filter - improves signal noise reduction
class KalmanFilter {
  private R: number = 0.01;  // Measurement noise
  private Q: number = 0.1;   // Process noise
  private P: number = 1;     // Error covariance
  private X: number = 0;     // State estimate
  private K: number = 0;     // Kalman gain

  /**
   * Apply Kalman filter to a measurement
   */
  filter(measurement: number): number {
    // Prediction update
    this.P = this.P + this.Q;
    
    // Measurement update
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    
    return this.X;
  }

  /**
   * Reset filter state
   */
  reset() {
    this.X = 0;
    this.P = 1;
  }
}

/**
 * PPG Signal Processor implementation
 * Processes camera frames to extract and analyze PPG signals
 */
export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  
  // Umbrales más estrictos para la configuración
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 15,           // Buffer for signal analysis
    MIN_RED_THRESHOLD: 45,     // Aumentado: Minimum threshold for red channel 
    MAX_RED_THRESHOLD: 240,    // Reducido: Maximum threshold for red channel
    STABILITY_WINDOW: 6,       // Window for stability analysis
    MIN_STABILITY_COUNT: 6,    // Aumentado: Increased from 5 to require more stable frames
    HYSTERESIS: 4,             // Reduced hysteresis for more sensitivity
    MIN_CONSECUTIVE_DETECTIONS: 5,  // Aumentado: Increased from 4 to require more consecutive detections
    QUALITY_THRESHOLD_POOR: 35,    // Increased: threshold for poor quality
    QUALITY_THRESHOLD_ACCEPTABLE: 55,  // Increased: threshold for acceptable quality 
    QUALITY_THRESHOLD_GOOD: 70,     // Increased: threshold for good quality
    QUALITY_THRESHOLD_EXCELLENT: 85 // New: threshold for excellent quality
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500; // 500ms timeout

  /**
   * Constructor
   */
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instance created");
  }

  /**
   * Initialize processor
   */
  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.consecutiveDetections = 0;
      this.isCurrentlyDetected = false;
      this.lastDetectionTime = 0;
      this.kalmanFilter.reset();
      console.log("PPGSignalProcessor: Initialized");
    } catch (error) {
      console.error("PPGSignalProcessor: Initialization error", error);
      this.handleError("INIT_ERROR", "Error initializing processor");
    }
  }

  /**
   * Start processing
   */
  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("PPGSignalProcessor: Started");
  }

  /**
   * Stop processing
   */
  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Stopped");
  }

  /**
   * Calibrate processor
   */
  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Starting calibration");
      await this.initialize();
      console.log("PPGSignalProcessor: Calibration completed");
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Calibration error", error);
      this.handleError("CALIBRATION_ERROR", "Error during calibration");
      return false;
    }
  }

  /**
   * Process a camera frame
   */
  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      console.log("PPGSignalProcessor: Not processing");
      return;
    }

    try {
      // Extract PPG signal based on scientific evidence
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      console.log("PPGSignalProcessor: Analysis", {
        redValue,
        filtered,
        isFingerDetected,
        quality,
        stableFrames: this.stableFrameCount,
        consecutiveDetections: this.consecutiveDetections
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
      console.error("PPGSignalProcessor: Error processing frame", error);
      this.handleError("PROCESSING_ERROR", "Error processing frame");
    }
  }

  /**
   * Extract red channel from image data
   */
  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let redVariance = 0;
    let count = 0;
    
    // Usar una región central más pequeña para obtener mejor señal (central 20% en lugar de 25%)
    const startX = Math.floor(imageData.width * 0.4);
    const endX = Math.floor(imageData.width * 0.6);
    const startY = Math.floor(imageData.height * 0.4);
    const endY = Math.floor(imageData.height * 0.6);
    
    // Primera pasada para calcular medias
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];     // Red channel
        greenSum += data[i+1]; // Green channel
        blueSum += data[i+2];  // Blue channel
        count++;
      }
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Segunda pasada para calcular varianza del canal rojo (indicador de calidad)
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redVariance += Math.pow(data[i] - avgRed, 2);
      }
    }
    
    const redStdDev = Math.sqrt(redVariance / count);
    
    // Comprobación más estricta de dominancia de rojo
    // Mayor diferencia requerida entre rojo y otros canales
    const isRedDominant = avgRed > (avgGreen * 1.35) && avgRed > (avgBlue * 1.35) && redStdDev < 30;
    
    return isRedDominant ? avgRed : 0;
  }

  /**
   * Analyze signal for finger detection and quality assessment
   */
  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Verificación más estricta de rango con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD;

    if (!inRange) {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1.5); // Disminución más rápida
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1.5); // Disminución más rápida
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT || this.consecutiveDetections < 2) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Análisis más estricto de estabilidad de señal
    const stability = this.calculateStability();
    if (stability > 0.8) { // Aumentado de 0.75 a 0.8 para exigir mayor estabilidad
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else if (stability > 0.6) { // Aumento gradual para estabilidad moderada
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 0.5,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      // Disminución más rápida para señales inestables
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
    }

    // Actualización de estado de detección
    const isStableNow = this.stableFrameCount >= this.currentConfig.MIN_STABILITY_COUNT;

    if (isStableNow) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.currentConfig.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else {
      // Disminución más rápida para detecciones inconsistentes
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      
      // Si perdemos demasiada estabilidad, resetear detección
      if (this.stableFrameCount < this.currentConfig.MIN_STABILITY_COUNT / 2) {
        this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      }
    }

    // Cálculo de calidad más exigente
    // Dar más peso a la estabilidad y penalizar valores extremos
    const stabilityScore = this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2);
    
    // Penalizar valores cercanos a los extremos del rango
    const optimalRedValue = (this.currentConfig.MIN_RED_THRESHOLD + this.currentConfig.MAX_RED_THRESHOLD) / 2;
    const redDeviation = Math.abs(rawValue - optimalRedValue) / (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD);
    const intensityScore = Math.max(0, 1 - (redDeviation * 2));
    
    // Calcular estabilidad de los últimos valores (variabilidad)
    const recentValuesVariability = this.calculateRecentVariability();
    const stabilityBonus = Math.max(0, 1 - recentValuesVariability);
    
    // Cálculo de calidad con mayor peso en estabilidad
    let quality = Math.round((stabilityScore * 0.6 + intensityScore * 0.25 + stabilityBonus * 0.15) * 100);
    
    // Aplicar umbrales más estrictos con transiciones graduales
    if (quality < this.currentConfig.QUALITY_THRESHOLD_POOR) {
      quality = quality; // Mantener valores muy bajos como están
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE) {
      // Rango de calidad pobre pero detectable
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_POOR + 5, quality);
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_GOOD) {
      // Rango de calidad aceptable
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE + 3, quality);
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_EXCELLENT) {
      // Rango de buena calidad
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_GOOD + 3, quality);
    } else {
      // Rango de calidad excelente
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_EXCELLENT, quality);
    }

    // Si el valor es extremo (cerca de los límites), penalizar calidad
    if (rawValue < this.currentConfig.MIN_RED_THRESHOLD + 10 || 
        rawValue > this.currentConfig.MAX_RED_THRESHOLD - 10) {
      quality = Math.max(10, quality - 15);
    }

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  /**
   * Calculate signal stability
   */
  private calculateStability(): number {
    if (this.lastValues.length < 3) return 0;
    
    // Cálculo mejorado de estabilidad basado en variaciones
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    
    // Penalizar más las variaciones grandes
    return Math.max(0, Math.min(1, 1 - (avgVariation / 40)));
  }
  
  /**
   * Calculate recent values variability (new method)
   */
  private calculateRecentVariability(): number {
    if (this.lastValues.length < 5) return 1;
    
    const recentValues = this.lastValues.slice(-5);
    const avg = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    
    const variance = recentValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / recentValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalizar a una escala de 0-1, donde 0 es estable
    return Math.min(1, stdDev / 40);
  }

  /**
   * Detect region of interest
   */
  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // Constant ROI for simplification
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  /**
   * Handle processor errors
   */
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
