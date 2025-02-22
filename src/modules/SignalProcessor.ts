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
  private readonly BUFFER_SIZE = 10;
  
  private redThreshold: { min: number; max: number } = {
    min: 30,
    max: 250
  };
  private stabilityThreshold: number = 5;
  private qualityThreshold: number = 0.7;
  private perfusionIndex: number = 0.05;
  
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    console.log("PPGSignalProcessor: Instancia creada con parámetros iniciales", {
      redThreshold: this.redThreshold,
      stabilityThreshold: this.stabilityThreshold,
      qualityThreshold: this.qualityThreshold,
      perfusionIndex: this.perfusionIndex
    });
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
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
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    console.log("PPGSignalProcessor: Iniciando calibración real");
    
    try {
      const calibrationValues: number[] = [];
      let startTime = Date.now();
      
      // Recolectar datos durante 3 segundos
      while (Date.now() - startTime < 3000) {
        if (this.lastValues.length > 0) {
          calibrationValues.push(this.lastValues[this.lastValues.length - 1]);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (calibrationValues.length < 20) {
        throw new Error("Insuficientes muestras para calibración");
      }

      // Calcular estadísticas de la señal
      const mean = calibrationValues.reduce((a, b) => a + b, 0) / calibrationValues.length;
      const std = Math.sqrt(
        calibrationValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / calibrationValues.length
      );

      // Ajustar umbrales basados en las estadísticas de la señal
      this.redThreshold = {
        min: Math.max(20, Math.floor(mean - 2 * std)),
        max: Math.min(255, Math.ceil(mean + 2 * std))
      };

      // Calcular la estabilidad de la señal
      const variations = [];
      for (let i = 1; i < calibrationValues.length; i++) {
        variations.push(Math.abs(calibrationValues[i] - calibrationValues[i-1]));
      }
      const avgVariation = variations.reduce((a, b) => a + b, 0) / variations.length;
      this.stabilityThreshold = Math.max(2, Math.min(10, avgVariation * 1.5));

      // Ajustar índice de perfusión basado en la amplitud de la señal
      const amplitude = Math.max(...calibrationValues) - Math.min(...calibrationValues);
      this.perfusionIndex = Math.max(0.03, Math.min(0.15, amplitude / mean));

      // Ajustar umbral de calidad basado en la estabilidad
      this.qualityThreshold = Math.max(0.5, Math.min(0.9, 1 - (avgVariation / mean)));

      console.log("PPGSignalProcessor: Calibración completada", {
        muestras: calibrationValues.length,
        mediaSeñal: mean,
        desviacionEstandar: std,
        nuevosParametros: {
          redThreshold: this.redThreshold,
          stabilityThreshold: this.stabilityThreshold,
          qualityThreshold: this.qualityThreshold,
          perfusionIndex: this.perfusionIndex
        }
      });

      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error durante la calibración:", error);
      // Restaurar valores por defecto en caso de error
      this.redThreshold = { min: 30, max: 250 };
      this.stabilityThreshold = 5;
      this.qualityThreshold = 0.7;
      this.perfusionIndex = 0.05;
      return false;
    }
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      console.log("PPGSignalProcessor: No está procesando");
      return;
    }

    try {
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.BUFFER_SIZE) {
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
    let count = 0;
    
    // Analizar solo el centro de la imagen (25% central)
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];  // Canal rojo
        count++;
      }
    }
    
    const avgRed = redSum / count;
    return avgRed;
  }

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const isInRange = rawValue >= this.redThreshold.min && rawValue <= this.redThreshold.max;
    
    if (!isInRange) {
      return { isFingerDetected: false, quality: 0 };
    }

    if (this.lastValues.length < 5) {
      return { isFingerDetected: false, quality: 0 };
    }

    const recentValues = this.lastValues.slice(-5);
    const avgVariation = recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(val - arr[i-1]);
    }, 0) / (recentValues.length - 1);

    const isStable = avgVariation < this.stabilityThreshold;
    const perfusion = avgVariation / filtered;
    
    let quality = 0;
    if (isStable && perfusion >= this.perfusionIndex) {
      const stabilityScore = Math.min(1, this.stabilityThreshold / avgVariation);
      const perfusionScore = Math.min(1, perfusion / this.perfusionIndex);
      quality = Math.round((stabilityScore * 0.7 + perfusionScore * 0.3) * 100);
    }

    return {
      isFingerDetected: quality >= this.qualityThreshold * 100,
      quality
    };
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
}
