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
  private readonly QUALITY_THRESHOLD = 0.5; // Reducido el umbral para mejor sensibilidad
  private frameCount: number = 0;
  private baselineRed: number = 0;
  
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
      const redValue = this.extractRedChannel(imageData);
      console.log("PPGSignalProcessor: Valor rojo extraído:", {
        frameCount: this.frameCount,
        redValue,
        imageDataSize: `${imageData.width}x${imageData.height}`,
        totalPixels: imageData.width * imageData.height
      });
      
      // Establecer línea base en los primeros frames
      if (this.frameCount <= 10) {
        this.baselineRed += redValue / 10;
        console.log("PPGSignalProcessor: Calculando línea base:", {
          frameCount: this.frameCount,
          currentBaselineRed: this.baselineRed
        });
        return;
      }

      const filtered = this.applyFilters(redValue);
      const quality = this.calculateSignalQuality(filtered);
      
      console.log("PPGSignalProcessor: Señal procesada:", {
        frameCount: this.frameCount,
        redValue,
        filtered,
        quality,
        baselineRed: this.baselineRed,
        bufferSize: this.frameBuffer.length
      });

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality,
        roi: this.detectROI(redValue)
      };

      this.lastValue = filtered;
      
      if (this.onSignalReady) {
        console.log("PPGSignalProcessor: Enviando señal al callback");
        this.onSignalReady(processedSignal);
      } else {
        console.warn("PPGSignalProcessor: No hay callback onSignalReady configurado");
      }

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      redSum += data[i];  // Canal rojo
      count++;
    }
    
    const avgRed = redSum / count;
    console.log("PPGSignalProcessor: Canal rojo extraído:", {
      totalRed: redSum,
      pixelCount: count,
      average: avgRed
    });
    
    return avgRed;
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

  private calculateSignalQuality(currentValue: number): number {
    // Si no hay suficientes frames, la calidad es baja
    if (this.frameCount < 10 || this.frameBuffer.length < 2) {
      return 0;
    }

    // Calcular la variación respecto a la línea base
    const variation = Math.abs(currentValue - this.baselineRed);
    const normalizedVariation = Math.min(variation / this.baselineRed, 1);

    // Calcular la estabilidad de la señal usando los últimos valores
    const recentValues = this.frameBuffer.slice(-5);
    const avgVariation = recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(val - arr[i-1]);
    }, 0) / (recentValues.length - 1);

    // Normalizar la variación promedio
    const normalizedStability = Math.max(0, 1 - (avgVariation / this.QUALITY_THRESHOLD));

    // Calcular la calidad final combinando ambos factores
    const rawQuality = (normalizedVariation + normalizedStability) / 2;
    const quality = Math.min(Math.max(rawQuality * 100, 0), 100);

    console.log("Calidad calculada:", {
      variation,
      normalizedVariation,
      avgVariation,
      normalizedStability,
      rawQuality,
      quality
    });

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
