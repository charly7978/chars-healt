
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
    BUFFER_SIZE: 8, // Reducido para menor uso de memoria
    MIN_RED_THRESHOLD: 80,
    MAX_RED_THRESHOLD: 245,
    STABILITY_WINDOW: 3, // Reducido para respuesta más rápida
    MIN_STABILITY_COUNT: 2 // Reducido para detección más rápida
  };
  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private lastProcessTime: number = 0;
  private readonly PROCESS_INTERVAL = 33; // ~30fps
  
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
      this.kalmanFilter.reset();
      this.lastProcessTime = 0;
      console.log("PPGSignalProcessor: Inicializado");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let count = 0;
    
    // Analizar solo una porción más pequeña de la imagen para mejor rendimiento
    const startX = Math.floor(imageData.width * 0.4);
    const endX = Math.floor(imageData.width * 0.6);
    const startY = Math.floor(imageData.height * 0.4);
    const endY = Math.floor(imageData.height * 0.6);
    
    // Optimización: saltar píxeles para mejorar rendimiento
    const skipPixels = 2;
    
    for (let y = startY; y < endY; y += skipPixels) {
      for (let x = startX; x < endX; x += skipPixels) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];
        count++;
      }
    }
    
    return redSum / count;
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      return;
    }

    const currentTime = Date.now();
    if (currentTime - this.lastProcessTime < this.PROCESS_INTERVAL) {
      return; // Limitar la frecuencia de procesamiento
    }
    this.lastProcessTime = currentTime;

    try {
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      
      // Mantener buffer pequeño
      this.lastValues.push(filtered);
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      const processedSignal: ProcessedSignal = {
        timestamp: currentTime,
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

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const isInRange = rawValue >= this.currentConfig.MIN_RED_THRESHOLD && 
                     rawValue <= this.currentConfig.MAX_RED_THRESHOLD;
    
    if (!isInRange) {
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      return { isFingerDetected: false, quality: 0 };
    }

    if (this.lastValues.length < this.currentConfig.STABILITY_WINDOW) {
      return { isFingerDetected: false, quality: 0 };
    }

    const recentValues = this.lastValues.slice(-this.currentConfig.STABILITY_WINDOW);
    const avgValue = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const avgVariation = recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(val - arr[i-1]);
    }, 0) / (recentValues.length - 1);

    const variationThreshold = Math.max(2.0, avgValue * 0.05);
    const isStable = avgVariation < variationThreshold;

    if (isStable) {
      this.stableFrameCount++;
      this.lastStableValue = filtered;
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
    }

    const isFingerDetected = this.stableFrameCount >= this.currentConfig.MIN_STABILITY_COUNT;
    
    let quality = 0;
    if (isFingerDetected) {
      const stabilityScore = Math.min(this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 1.5), 1);
      const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                    (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
      const variationScore = Math.max(0, 1 - (avgVariation / variationThreshold));
      
      quality = Math.round((stabilityScore * 0.4 + intensityScore * 0.3 + variationScore * 0.3) * 100);
    }

    return { isFingerDetected, quality };
  }

  private detectROI(redValue: number): ProcessedSignal['roi'] {
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
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await this.initialize();
      
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        // Configuración específica para Android
        this.currentConfig = {
          ...this.DEFAULT_CONFIG,
          BUFFER_SIZE: 6,
          STABILITY_WINDOW: 3,
          MIN_STABILITY_COUNT: 2
        };
      }
      
      console.log("PPGSignalProcessor: Calibración completada", this.currentConfig);
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }
}
