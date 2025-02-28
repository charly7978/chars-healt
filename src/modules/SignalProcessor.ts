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
    BUFFER_SIZE: 15,           // Buffer para análisis de señal
    MIN_RED_THRESHOLD: 40,     // Umbral mínimo para canal rojo
    MAX_RED_THRESHOLD: 250,    // Umbral máximo para canal rojo
    STABILITY_WINDOW: 6,       // Ventana para análisis de estabilidad
    MIN_STABILITY_COUNT: 4,    // Mínimo de muestras estables
    HYSTERESIS: 5,             // Histéresis para evitar fluctuaciones
    MIN_CONSECUTIVE_DETECTIONS: 3  // Mínimo de detecciones consecutivas necesarias
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500; // 500ms timeout
  private workerInstance: Worker | null = null;

  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instancia creada (legacy mode)");
    
    // Este constructor es solo para compatibilidad con código existente
    // La implementación real ahora está en el Web Worker
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
      console.log("PPGSignalProcessor: Inicializado (legacy mode)");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("PPGSignalProcessor: Iniciado (legacy mode)");
  }

  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.kalmanFilter.reset();
    
    // Forzar limpieza de memoria
    this.lastValues.length = 0;
    
    console.log("PPGSignalProcessor: Detenido (legacy mode)");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración (legacy mode)");
      await this.initialize();
      console.log("PPGSignalProcessor: Calibración completada (legacy mode)");
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  processFrame(imageData: ImageData): void {
    // La implementación real ahora está en el Web Worker
    // Esta función queda como compatibilidad, pero la lógica de procesamiento
    // se ha movido al Web Worker para mejorar el rendimiento
    
    if (!this.isProcessing) {
      console.log("PPGSignalProcessor: No está procesando (legacy mode)");
      return;
    }

    try {
      // Código simplificado que envía un mensaje simulado con datos vacíos
      // para mantener compatibilidad con código existente
      const dummySignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: 0,
        filteredValue: 0,
        quality: 0,
        fingerDetected: false,
        roi: this.detectROI(0)
      };

      if (this.onSignalReady) {
        this.onSignalReady(dummySignal);
      }
    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame (legacy mode)", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    // Método simplificado para compatibilidad
    return 0;
  }

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    // Método simplificado para compatibilidad
    return { isFingerDetected: false, quality: 0 };
  }

  private calculateStability(): number {
    // Método simplificado para compatibilidad
    return 0;
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
    if (this.onError) {
      this.onError(error);
    }
  }
}
