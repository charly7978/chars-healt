
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
  private lastValue: number = 0;
  private frameBuffer: number[] = [];
  private readonly BUFFER_SIZE = 30;
  private readonly QUALITY_THRESHOLD = 10;
  
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
  }

  async initialize(): Promise<void> {
    try {
      this.frameBuffer = [];
      this.lastValue = 0;
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
    this.lastValue = 0;
    console.log("Deteniendo procesamiento de señales");
  }

  async calibrate(): Promise<boolean> {
    try {
      this.frameBuffer = [];
      this.lastValue = 0;
      return true;
    } catch (error) {
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) return;

    try {
      const redValue = this.extractRedChannel(imageData);
      const roi = this.detectROI(redValue);
      const filtered = this.applyFilters(redValue);
      const quality = this.calculateSignalQuality(filtered);

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality,
        roi
      };

      this.lastValue = filtered;
      this.onSignalReady?.(processedSignal);

    } catch (error) {
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      redSum += data[i];
      count++;
    }
    
    return redSum / count;
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
    
    return this.applyButterworthFilter(filtered);
  }

  private applyButterworthFilter(value: number): number {
    const cutoff = 4.0;
    const resonance = 0.51;
    return value * (1 / (1 + Math.pow(value/cutoff, 2*resonance)));
  }

  private calculateSignalQuality(currentValue: number): number {
    if (this.frameBuffer.length < 2) return 0;

    // Calcular la variación de la señal
    const variation = Math.abs(currentValue - this.lastValue);
    
    // Calcular la estabilidad de la señal
    const recentValues = this.frameBuffer.slice(-5);
    const avgVariation = recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(val - arr[i-1]);
    }, 0) / (recentValues.length - 1);

    // Normalizar la calidad
    const stability = Math.max(0, 100 - (avgVariation * 10));
    const variationQuality = Math.max(0, 100 - (variation * 10));
    
    // Combinar métricas
    const quality = Math.min(stability, variationQuality);
    
    // Suavizar cambios bruscos
    return Math.round(quality);
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
