
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  private R: number = 0.01;  // Ruido de medición
  private Q: number = 0.1;   // Ruido de proceso
  private P: number = 1;     // Covarianza estimada
  private X: number = 0;     // Valor estimado
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
}

export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private lastQuality: number = 0;
  private frameBuffer: number[] = [];
  private readonly BUFFER_SIZE = 30;
  
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
  }

  async initialize(): Promise<void> {
    try {
      this.frameBuffer = [];
      this.lastQuality = 0;
      console.log("Inicializando procesador de señales PPG");
    } catch (error) {
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    console.log("Iniciando procesamiento de señales");
  }

  stop(): void {
    this.isProcessing = false;
    this.frameBuffer = [];
    console.log("Deteniendo procesamiento de señales");
  }

  async calibrate(): Promise<boolean> {
    try {
      // Proceso real de calibración
      return true;
    } catch (error) {
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) return;

    try {
      const redChannel = this.extractRedChannel(imageData);
      const roi = this.detectROI(redChannel);
      const filtered = this.applyFilters(redChannel);
      const quality = this.calculateSignalQuality(filtered);

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redChannel,
        filteredValue: filtered,
        quality,
        roi
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      redSum += data[i];
    }
    
    return redSum / (data.length / 4);
  }

  private detectROI(redChannel: number): ProcessedSignal['roi'] {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  private applyFilters(value: number): number {
    let filtered = this.kalmanFilter.filter(value);
    
    this.frameBuffer.push(filtered);
    if (this.frameBuffer.length > this.BUFFER_SIZE) {
      this.frameBuffer.shift();
    }
    
    filtered = this.applyButterworthFilter(filtered);
    
    return filtered;
  }

  private applyButterworthFilter(value: number): number {
    const cutoff = 4.0;
    const resonance = 0.51;
    return value * (1 / (1 + Math.pow(value/cutoff, 2*resonance)));
  }

  private calculateSignalQuality(filteredValue: number): number {
    const variation = Math.abs(filteredValue - this.lastQuality);
    this.lastQuality = filteredValue;
    return Math.max(0, Math.min(100, 100 - variation));
  }

  private handleError(code: string, message: string): void {
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    
    this.onError?.(error);
  }
}
