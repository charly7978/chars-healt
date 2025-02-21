
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
      // Simular proceso de calibración
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    } catch (error) {
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  // Método para procesar un nuevo frame de video
  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) return;

    try {
      // Extraer canal rojo y detectar ROI
      const redChannel = this.extractRedChannel(imageData);
      const roi = this.detectROI(redChannel);
      
      // Aplicar filtros en cascada
      const filtered = this.applyFilters(redChannel);
      
      // Calcular calidad de señal
      const quality = this.calculateSignalQuality(filtered);

      // Crear señal procesada
      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redChannel,
        filteredValue: filtered,
        quality,
        roi
      };

      // Notificar resultado
      this.onSignalReady?.(processedSignal);

    } catch (error) {
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    
    // Extraer solo el canal rojo (cada 4 bytes: R,G,B,A)
    for (let i = 0; i < data.length; i += 4) {
      redSum += data[i];
    }
    
    return redSum / (data.length / 4);
  }

  private detectROI(redChannel: number): ProcessedSignal['roi'] {
    // Implementación básica de detección de ROI
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  private applyFilters(value: number): number {
    // Aplicar Kalman
    let filtered = this.kalmanFilter.filter(value);
    
    // Buffer para Wavelet (simplificado)
    this.frameBuffer.push(filtered);
    if (this.frameBuffer.length > this.BUFFER_SIZE) {
      this.frameBuffer.shift();
    }
    
    // Aplicar Butterworth (simplificado)
    filtered = this.applyButterworthFilter(filtered);
    
    return filtered;
  }

  private applyButterworthFilter(value: number): number {
    // Implementación simplificada de Butterworth
    const cutoff = 4.0; // Frecuencia de corte en Hz
    const resonance = 0.51; // Factor de resonancia
    
    return value * (1 / (1 + Math.pow(value/cutoff, 2*resonance)));
  }

  private calculateSignalQuality(filteredValue: number): number {
    // Algoritmo simplificado de calidad de señal
    const variation = Math.abs(filteredValue - this.lastQuality);
    this.lastQuality = filteredValue;
    
    // Normalizar la calidad entre 0 y 100
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
