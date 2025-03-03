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

// Definir una interfaz de error compatible
export interface ProcessingError extends Error {
  code: string;
  message: string;
}

export interface Signal {
  raw: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  timestamp: number;
  processingTime: number;
}

/**
 * PPG Signal Processor implementation
 * Processes camera frames to extract and analyze PPG signals
 */
export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  private onError?: (error: Error) => void;
  private isInitialized: boolean = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private signalBuffer: number[] = [];
  private medianValues: number[] = [];
  private movingAvgValues: number[] = [];
  private emaValue: number | null = null;
  private lastQuality: number | null = null;
  private lastFilteredValue: number = 0;
  private lastFilterUpdate: number = 0;
  private lastSignal: Signal | null = null;
  
  // Configuration settings
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 15,           // Buffer for signal analysis
    MIN_RED_THRESHOLD: 40,     // Minimum threshold for red channel
    MAX_RED_THRESHOLD: 250,    // Maximum threshold for red channel
    STABILITY_WINDOW: 6,       // Window for stability analysis
    MIN_STABILITY_COUNT: 5,    // Increased from 4 to require more stable frames
    HYSTERESIS: 5,             // Hysteresis to avoid fluctuations
    MIN_CONSECUTIVE_DETECTIONS: 4,  // Increased from 3 to require more consecutive detections
    QUALITY_THRESHOLD_POOR: 30,    // New: threshold for poor quality
    QUALITY_THRESHOLD_ACCEPTABLE: 50,  // New: threshold for acceptable quality
    QUALITY_THRESHOLD_GOOD: 75     // New: threshold for good quality
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
    errorHandler?: (error: Error) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    this.onError = errorHandler;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
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
      this.signalBuffer = [];
      this.medianValues = [];
      this.movingAvgValues = [];
      this.emaValue = null;
      this.lastQuality = null;
      this.lastFilteredValue = 0;
      this.lastFilterUpdate = 0;
      this.lastSignal = null;
      console.log("PPGSignalProcessor: Initialized");
      this.isInitialized = true;
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
    this.signalBuffer = [];
    this.medianValues = [];
    this.movingAvgValues = [];
    this.emaValue = null;
    this.lastQuality = null;
    this.lastFilteredValue = 0;
    this.lastFilterUpdate = 0;
    this.lastSignal = null;
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
    let count = 0;
    
    // Use central region for better signal (central 25%)
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
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

    // Check red channel dominance (characteristic of blood-containing tissue)
    const isRedDominant = avgRed > (avgGreen * 1.25) && avgRed > (avgBlue * 1.25); // Increased from 1.2 to 1.25 for stronger red dominance requirement
    
    return isRedDominant ? avgRed : 0;
  }

  /**
   * Analyze signal for finger detection and quality assessment
   */
  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Check if value is within valid range with hysteresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD;

    if (!inRange) {
      this.consecutiveDetections = 0;
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analyze signal stability - scientifically validated measure
    const stability = this.calculateStability();
    if (stability > 0.75) { // Increased from 0.7 to 0.75 for stricter stability requirement
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      // More gradual decrease for stability - add a fractional decrease for smoother transition
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 0.5);
    }

    // Update detection state
    const isStableNow = this.stableFrameCount >= this.currentConfig.MIN_STABILITY_COUNT;

    if (isStableNow) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.currentConfig.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else {
      // More gradual decrease for consecutive detections - add fractional decrease
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
    }

    // Calculate signal quality based on photoplethysmography principles
    const stabilityScore = this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2);
    const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
    
    // Improved quality calculation with smoother gradient between quality levels
    let quality = Math.round((stabilityScore * 0.6 + intensityScore * 0.4) * 100);
    
    // Apply more gradual quality transitions with some hysteresis
    if (quality < this.currentConfig.QUALITY_THRESHOLD_POOR) {
      // Keep very low quality as is
      quality = quality;
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE) {
      // Poor but detectable quality range - make sure it's visible to user
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_POOR + 5, quality);
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_GOOD) {
      // Acceptable quality range - ensure clear difference from poor
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE + 3, quality);
    } else {
      // Good quality range - keep as is
      quality = quality;
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
    if (this.lastValues.length < 2) return 0;
    
    // Stability calculation based on research
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    return Math.max(0, Math.min(1, 1 - (avgVariation / 50)));
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

  /**
   * Optimización del procesador de frames para mejor rendimiento
   */
  async processVideoFrame(videoElement: HTMLVideoElement): Promise<Signal | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Si no hay un contexto de lienzo, no podemos procesar
    if (!this.ctx) {
      return null;
    }

    try {
      const startTime = performance.now();
      
      // Verificar si el frame es válido para evitar errores
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        return null;
      }

      // Dibujamos el frame en el canvas con tamaño reducido para mejor rendimiento
      const ROI_SIZE = Math.min(100, Math.min(videoElement.videoWidth, videoElement.videoHeight) / 4);
      
      // Centrar la región de interés
      const sourceX = Math.floor((videoElement.videoWidth - ROI_SIZE) / 2);
      const sourceY = Math.floor((videoElement.videoHeight - ROI_SIZE) / 2);
      
      // Usar un canvas más pequeño para el procesamiento
      this.canvas.width = ROI_SIZE;
      this.canvas.height = ROI_SIZE;
      
      // Dibujar sólo la región central para procesamiento más rápido
      this.ctx.drawImage(
        videoElement,
        sourceX, sourceY, ROI_SIZE, ROI_SIZE,
        0, 0, ROI_SIZE, ROI_SIZE
      );

      // Obtener los datos de la imagen para análisis
      const imageData = this.ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
      const data = imageData.data;
      
      // Optimización: procesar muestreando los píxeles (cada N píxeles) para mejorar rendimiento
      const SAMPLING_RATE = 4; // Procesar 1 de cada 4 píxeles
      const pixelCount = Math.floor((data.length / 4) / SAMPLING_RATE);
      
      let redTotal = 0;
      let greenTotal = 0;
      let blueTotal = 0;
      let validPixels = 0;
      
      // Usar acceso directo al array para mejor rendimiento
      for (let i = 0; i < data.length; i += 4 * SAMPLING_RATE) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Detectar si el pixel es de piel (mejora en la detección)
        if (this.isSkinPixel(r, g, b)) {
          redTotal += r;
          greenTotal += g;
          blueTotal += b;
          validPixels++;
        }
      }

      // Si no hay píxeles válidos, posiblemente no hay un dedo en la cámara
      const fingerDetected = validPixels > (pixelCount * 0.1);
      
      // Calcular el valor promedio de cada canal si hay un dedo detectado
      const redAvg = fingerDetected ? redTotal / validPixels : 0;
      const greenAvg = fingerDetected ? greenTotal / validPixels : 0;
      const blueAvg = fingerDetected ? blueTotal / validPixels : 0;
      
      // Aplicar normalización y filtrado para obtener la señal PPG
      // La señal PPG se encuentra principalmente en el canal rojo
      const rawValue = redAvg / 255;
      
      // Aplicar buffer circular para procesamiento más estable
      this.addToBuffer(rawValue);
      
      // Calcular la calidad de la señal basada en la variación y estabilidad
      const signalQuality = this.calculateSignalQuality(fingerDetected);
      
      // Optimización temporal: limitar la frecuencia de cálculos intensivos
      const now = Date.now();
      const shouldUpdateFilteredValue = (now - this.lastFilterUpdate) > 16; // ~60 FPS
      
      let filteredValue = this.lastFilteredValue;
      if (shouldUpdateFilteredValue) {
        // Aplicar filtrado avanzado en períodos específicos para ahorrar CPU
        filteredValue = this.applySignalFilters(rawValue);
        this.lastFilteredValue = filteredValue;
        this.lastFilterUpdate = now;
      }

      const signal: Signal = {
        raw: rawValue,
        filteredValue: filteredValue,
        quality: signalQuality,
        fingerDetected: fingerDetected,
        timestamp: now,
        processingTime: performance.now() - startTime
      };

      this.lastSignal = signal;
      return signal;
    } catch (error) {
      console.error("Error procesando frame:", error);
      this.handleError("PROCESSING_ERROR", "Error procesando el frame del video");
      return null;
    }
  }

  /**
   * Optimización de la detección de piel para mejor precisión
   */
  private isSkinPixel(r: number, g: number, b: number): boolean {
    // Condiciones optimizadas para detección de piel en entornos con luz variable
    const sum = r + g + b;
    
    // Evitar división por cero
    if (sum === 0) return false;
    
    // Normalizar valores
    const rNorm = r / sum;
    const gNorm = g / sum;
    
    // Reglas para detectar color de piel (adaptivas a diferentes tonos)
    return (
      r > 60 && // Suficiente componente rojo
      r > g && // Rojo mayor que verde
      r > b && // Rojo mayor que azul
      rNorm > 0.35 && // Proporción de rojo significativa
      gNorm < 0.4 && // No demasiado verde
      Math.abs(r - g) > 15 // Diferencia entre rojo y verde
    );
  }

  /**
   * Optimización de filtros para mejor señal y rendimiento
   */
  private applySignalFilters(value: number): number {
    // Filtro de mediana para eliminar valores atípicos
    this.medianValues.push(value);
    if (this.medianValues.length > 5) {
      this.medianValues.shift();
    }
    
    // Clonar para no modificar el original durante la ordenación
    const sortedValues = [...this.medianValues].sort((a, b) => a - b);
    const medianValue = sortedValues[Math.floor(sortedValues.length / 2)];
    
    // Filtro de media móvil para suavizado inicial
    this.movingAvgValues.push(medianValue);
    if (this.movingAvgValues.length > 10) {
      this.movingAvgValues.shift();
    }
    
    const avgValue = this.movingAvgValues.reduce((sum, val) => sum + val, 0) / 
                     this.movingAvgValues.length;
    
    // EMA (Promedio Móvil Exponencial) para seguimiento adaptativo
    if (this.emaValue === null) {
      this.emaValue = avgValue;
    } else {
      // Factor alfa optimizado para mayor estabilidad
      const alpha = 0.2;
      this.emaValue = alpha * avgValue + (1 - alpha) * this.emaValue;
    }
    
    return this.emaValue;
  }

  /**
   * Cálculo optimizado de la calidad de la señal
   */
  private calculateSignalQuality(fingerDetected: boolean): number {
    if (!fingerDetected) return 0;
    
    // Si el buffer no tiene suficientes muestras, la calidad es baja
    if (this.signalBuffer.length < 20) return 0.2;
    
    // Obtener las últimas N muestras para análisis
    const recentValues = this.signalBuffer.slice(-30);
    
    // 1. Calcular varianza (para medir ruido)
    const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const variance = recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length;
    
    // 2. Calcular la diferencia entre máximo y mínimo (amplitud de la señal)
    const min = Math.min(...recentValues);
    const max = Math.max(...recentValues);
    const amplitude = max - min;
    
    // 3. Calcular la estabilidad de la línea base
    const baselineStability = 1 - Math.min(1, variance * 20);
    
    // 4. Calcular la fuerza de la señal basada en la amplitud
    const signalStrength = Math.min(1, amplitude * 10);
    
    // 5. Evaluar cambios bruscos (indicativos de movimiento)
    let suddenChanges = 0;
    for (let i = 1; i < recentValues.length; i++) {
      const change = Math.abs(recentValues[i] - recentValues[i - 1]);
      if (change > 0.05) {
        suddenChanges++;
      }
    }
    const stability = 1 - Math.min(1, (suddenChanges / recentValues.length) * 2);
    
    // Calcular puntuación compuesta de calidad
    let quality = (
      baselineStability * 0.4 +
      signalStrength * 0.4 +
      stability * 0.2
    );
    
    // Limitar los valores entre 0 y 1
    quality = Math.max(0, Math.min(1, quality));
    
    // Aplicar EMA para suavizar los cambios en la calidad reportada
    if (this.lastQuality === null) {
      this.lastQuality = quality;
    } else {
      this.lastQuality = 0.7 * this.lastQuality + 0.3 * quality;
    }
    
    return this.lastQuality;
  }

  // Método para agregar un valor al buffer
  private addToBuffer(value: number): void {
    this.signalBuffer.push(value);
    // Mantener un tamaño de buffer manejable
    if (this.signalBuffer.length > 100) {
      this.signalBuffer.shift();
    }
  }
}
