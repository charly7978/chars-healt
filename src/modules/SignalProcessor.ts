
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
  private frameCount: number = 0;
  
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    console.log("PPGSignalProcessor: Instancia creada");
  }

  async initialize(): Promise<void> {
    try {
      this.frameBuffer = [];
      this.lastValue = 0;
      this.frameCount = 0;
      console.log("PPGSignalProcessor: Inicializando procesador");
      console.log("PPGSignalProcessor: Buffer limpiado");
      console.log("PPGSignalProcessor: Valores reseteados");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  start(): void {
    if (this.isProcessing) {
      console.log("PPGSignalProcessor: Ya está en procesamiento");
      return;
    }
    this.isProcessing = true;
    console.log("PPGSignalProcessor: Iniciando procesamiento de señales");
  }

  stop(): void {
    this.isProcessing = false;
    this.frameBuffer = [];
    this.lastValue = 0;
    this.frameCount = 0;
    console.log("PPGSignalProcessor: Deteniendo procesamiento");
    console.log("PPGSignalProcessor: Buffer limpiado");
    console.log("PPGSignalProcessor: Valores reseteados");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      this.frameBuffer = [];
      this.lastValue = 0;
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
      console.log("PPGSignalProcessor: No está procesando, frame ignorado");
      return;
    }

    try {
      this.frameCount++;
      console.log(`PPGSignalProcessor: Procesando frame #${this.frameCount}`);

      const redValue = this.extractRedChannel(imageData);
      console.log("PPGSignalProcessor: Valor rojo extraído:", redValue);

      const roi = this.detectROI(redValue);
      console.log("PPGSignalProcessor: ROI detectado:", roi);

      const filtered = this.applyFilters(redValue);
      console.log("PPGSignalProcessor: Valor filtrado:", filtered);

      const quality = this.calculateSignalQuality(filtered);
      console.log("PPGSignalProcessor: Calidad calculada:", quality);

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality,
        roi
      };

      this.lastValue = filtered;
      console.log("PPGSignalProcessor: Señal procesada:", processedSignal);
      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    console.log("PPGSignalProcessor: Extrayendo canal rojo");
    const data = imageData.data;
    let redSum = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      redSum += data[i];
      count++;
    }
    
    const avgRed = redSum / count;
    console.log("PPGSignalProcessor: Promedio canal rojo:", avgRed);
    return avgRed;
  }

  private detectROI(redChannel: number): ProcessedSignal['roi'] {
    console.log("PPGSignalProcessor: Detectando ROI");
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }

  private applyFilters(value: number): number {
    console.log("PPGSignalProcessor: Aplicando filtros. Valor inicial:", value);
    
    let filtered = this.kalmanFilter.filter(value);
    console.log("PPGSignalProcessor: Después de Kalman:", filtered);
    
    this.frameBuffer.push(filtered);
    if (this.frameBuffer.length > this.BUFFER_SIZE) {
      this.frameBuffer.shift();
      console.log("PPGSignalProcessor: Buffer rotado, nuevo tamaño:", this.frameBuffer.length);
    }
    
    filtered = this.applyButterworthFilter(filtered);
    console.log("PPGSignalProcessor: Después de Butterworth:", filtered);
    
    return filtered;
  }

  private applyButterworthFilter(value: number): number {
    console.log("PPGSignalProcessor: Aplicando filtro Butterworth. Entrada:", value);
    const cutoff = 4.0;
    const resonance = 0.51;
    const filtered = value * (1 / (1 + Math.pow(value/cutoff, 2*resonance)));
    console.log("PPGSignalProcessor: Salida Butterworth:", filtered);
    return filtered;
  }

  private calculateSignalQuality(currentValue: number): number {
    console.log("PPGSignalProcessor: Calculando calidad. Valor actual:", currentValue);
    
    if (this.frameBuffer.length < 2) {
      console.log("PPGSignalProcessor: Buffer insuficiente para calidad");
      return 0;
    }

    const variation = Math.abs(currentValue - this.lastValue);
    console.log("PPGSignalProcessor: Variación:", variation);
    
    const recentValues = this.frameBuffer.slice(-5);
    console.log("PPGSignalProcessor: Valores recientes:", recentValues);
    
    const avgVariation = recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(val - arr[i-1]);
    }, 0) / (recentValues.length - 1);
    
    console.log("PPGSignalProcessor: Variación promedio:", avgVariation);

    const stability = Math.max(0, 100 - (avgVariation * 10));
    const variationQuality = Math.max(0, 100 - (variation * 10));
    
    console.log("PPGSignalProcessor: Estabilidad:", stability);
    console.log("PPGSignalProcessor: Calidad de variación:", variationQuality);
    
    const quality = Math.min(stability, variationQuality);
    console.log("PPGSignalProcessor: Calidad final:", quality);
    
    return Math.round(quality);
  }

  private handleError(code: string, message: string): void {
    console.error("PPGSignalProcessor: Error detectado", code, message);
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    
    this.onError?.(error);
  }
}
