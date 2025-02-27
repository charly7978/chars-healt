
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

class KalmanFilter {
  private R: number = 0.01; // Ruido de medición
  private Q: number = 0.1;  // Ruido del proceso
  private P: number = 1;    // Estimación inicial de error
  private X: number = 0;    // Estado inicial
  private K: number = 0;    // Ganancia de Kalman

  filter(measurement: number): number {
    // Predicción
    this.P = this.P + this.Q;
    
    // Actualización
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
    BUFFER_SIZE: 30,           // Ventana de análisis más grande
    MIN_RED_THRESHOLD: 35,     // Umbral más bajo para mejor sensibilidad
    MAX_RED_THRESHOLD: 255,    // Máximo valor posible
    STABILITY_WINDOW: 8,       // Ventana más grande para estabilidad
    MIN_STABILITY_COUNT: 5,    // Más muestras para confirmar estabilidad
    PEAK_MIN_PROMINENCE: 0.4,  // Prominencia mínima para picos
    MIN_PEAK_DISTANCE: 20,     // Distancia mínima entre picos en frames
    SMOOTH_FACTOR: 0.85,       // Factor de suavizado exponencial
    BPM_MIN: 40,              // Mínimo BPM fisiológico
    BPM_MAX: 200              // Máximo BPM fisiológico
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private baseline: number = 0;
  private peakBuffer: number[] = [];
  private lastPeakTime: number = 0;
  private smoothedValue: number = 0;
  private signalBuffer: Array<{value: number, time: number}> = [];

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
      this.peakBuffer = [];
      this.baseline = 0;
      this.smoothedValue = 0;
      this.signalBuffer = [];
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
    this.smoothedValue = this.currentConfig.SMOOTH_FACTOR * this.smoothedValue + 
                        (1 - this.currentConfig.SMOOTH_FACTOR) * value;
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

  private isPeak(values: number[], index: number): boolean {
    if (index < 2 || index >= values.length - 2) return false;

    const now = Date.now();
    const timeSinceLastPeak = now - this.lastPeakTime;
    const minPeakInterval = (60 / this.currentConfig.BPM_MAX) * 1000;
    
    if (timeSinceLastPeak < minPeakInterval) return false;

    const value = values[index];
    const prev2 = values[index - 2];
    const prev1 = values[index - 1];
    const next1 = values[index + 1];
    const next2 = values[index + 2];

    // Verificar si es máximo local
    if (value <= prev1 || value <= prev2 || value <= next1 || value <= next2) return false;

    // Calcular prominencia
    const leftMin = Math.min(prev1, prev2);
    const rightMin = Math.min(next1, next2);
    const prominence = Math.min(value - leftMin, value - rightMin);

    if (prominence < this.currentConfig.PEAK_MIN_PROMINENCE) return false;

    this.lastPeakTime = now;
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

      const isPeak = this.lastValues.length >= 5 && 
                    this.isPeak(this.lastValues, this.lastValues.length - 3);

      this.signalBuffer.push({
        value: normalizedValue,
        time: Date.now()
      });

      // Mantener buffer de señal limitado
      while (this.signalBuffer.length > this.currentConfig.BUFFER_SIZE) {
        this.signalBuffer.shift();
      }

      const quality = this.calculateSignalQuality();
      const fingerDetected = redValue > this.currentConfig.MIN_RED_THRESHOLD &&
                           redValue < this.currentConfig.MAX_RED_THRESHOLD;

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: normalizedValue,
        quality: quality,
        fingerDetected: fingerDetected,
        roi: this.detectROI(redValue),
        isPeak: isPeak
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

    // Calcular SNR aproximado
    const mean = this.lastValues.reduce((a, b) => a + b, 0) / this.lastValues.length;
    const variance = this.lastValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.lastValues.length;
    const signalPower = Math.pow(mean, 2);
    const noisePower = variance;
    const snr = signalPower / (noisePower + 1e-10);

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
