
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
    BUFFER_SIZE: 100,          // Buffer más grande para mejor análisis
    MIN_RED_THRESHOLD: 30,     // Umbral más bajo para mejor sensibilidad
    MAX_RED_THRESHOLD: 255,    // Máximo valor posible
    PEAK_THRESHOLD: 0.3,       // Umbral para detección de picos
    MIN_PEAK_DISTANCE: 15,     // Distancia mínima entre picos (frames)
    SMOOTH_FACTOR: 0.8,        // Factor de suavizado
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private baseline: number = 0;
  private lastPeakValue: number = 0;
  private lastPeakTime: number = 0;
  private smoothedValue: number = 0;

  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.baseline = 0;
      this.lastPeakValue = 0;
      this.lastPeakTime = 0;
      this.smoothedValue = 0;
      this.kalmanFilter.reset();
    } catch (error) {
      this.handleError("INIT_ERROR", "Error al inicializar el procesador");
    }
  }

  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
  }

  stop(): void {
    this.isProcessing = false;
    this.initialize();
  }

  async calibrate(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  private smoothSignal(value: number): number {
    if (this.smoothedValue === 0) {
      this.smoothedValue = value;
    } else {
      this.smoothedValue = this.currentConfig.SMOOTH_FACTOR * this.smoothedValue + 
                          (1 - this.currentConfig.SMOOTH_FACTOR) * value;
    }
    return this.smoothedValue;
  }

  private updateBaseline(value: number): number {
    if (this.baseline === 0) {
      this.baseline = value;
    } else {
      this.baseline = 0.95 * this.baseline + 0.05 * value;
    }
    return this.baseline;
  }

  private isPeak(values: number[]): boolean {
    if (values.length < 3) return false;

    const currentValue = values[values.length - 1];
    const prevValue = values[values.length - 2];
    
    const now = Date.now();
    const timeSinceLastPeak = now - this.lastPeakTime;
    
    // No detectar picos demasiado cercanos
    if (timeSinceLastPeak < 300) { // Mínimo 300ms entre picos (200 BPM máximo)
      return false;
    }

    // Verificar si es un máximo local
    if (currentValue <= prevValue) {
      return false;
    }

    // Calcular umbral dinámico basado en los últimos valores
    const recentValues = values.slice(-10);
    const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const threshold = mean * this.currentConfig.PEAK_THRESHOLD;

    // Verificar si supera el umbral
    if (currentValue - this.baseline < threshold) {
      return false;
    }

    // Actualizar referencia del último pico
    this.lastPeakValue = currentValue;
    this.lastPeakTime = now;
    
    console.log('Peak detected:', {
      value: currentValue,
      baseline: this.baseline,
      threshold,
      timeSinceLastPeak
    });

    return true;
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) return;

    try {
      const redValue = this.extractRedChannel(imageData);
      const filteredValue = this.kalmanFilter.filter(redValue);
      const smoothedValue = this.smoothSignal(filteredValue);
      const baseline = this.updateBaseline(smoothedValue);
      const normalizedValue = smoothedValue - baseline;

      this.lastValues.push(normalizedValue);
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const isPeak = this.isPeak(this.lastValues);

      const quality = this.calculateSignalQuality();
      const fingerDetected = redValue > this.currentConfig.MIN_RED_THRESHOLD &&
                           redValue < this.currentConfig.MAX_RED_THRESHOLD;

      if (isPeak) {
        console.log('Processed signal with peak:', {
          normalizedValue,
          quality,
          fingerDetected
        });
      }

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: normalizedValue,
        quality: quality,
        fingerDetected: fingerDetected,
        isPeak: isPeak,
        roi: this.detectROI(redValue)
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data;
    let redSum = 0;
    let count = 0;
    
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];
        count++;
      }
    }
    
    return redSum / count;
  }

  private calculateSignalQuality(): number {
    if (this.lastValues.length < 10) return 0;

    const mean = this.lastValues.reduce((a, b) => a + b, 0) / this.lastValues.length;
    const variance = this.lastValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.lastValues.length;
    const snr = Math.pow(mean, 2) / (variance + 1e-10);

    return Math.min(Math.max(snr * 50, 0), 100);
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
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    this.onError?.(error);
  }
}
