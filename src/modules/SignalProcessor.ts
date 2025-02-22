
import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';
import { VitalSignalProcessor } from './VitalSignalProcessor';

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
  private vitalProcessor: VitalSignalProcessor;
  private lastValues: number[] = [];
  private readonly BUFFER_SIZE = 10;
  private readonly MIN_RED_THRESHOLD = 100; // Ajustado para mejor detección
  private readonly MAX_RED_THRESHOLD = 250;
  private readonly STABILITY_WINDOW = 5;
  private readonly MIN_STABILITY_COUNT = 3;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private lastBPM: number = 0;
  private lastConfidence: number = 0;
  
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.vitalProcessor = new VitalSignalProcessor();
    console.log("PPGSignalProcessor: Instancia creada con procesador vital");
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.kalmanFilter.reset();
      this.vitalProcessor.reset();
      this.lastBPM = 0;
      this.lastConfidence = 0;
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
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.kalmanFilter.reset();
    this.vitalProcessor.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      this.handleError("CALIBRATION_ERROR", "Error durante la calibración");
      return false;
    }
  }

  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
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
      console.log("Análisis de señal:", { redValue, filtered, isFingerDetected, quality });

      let heartRate = 0;
      let confidence = 0;

      if (isFingerDetected) {
        const vitalSigns = this.vitalProcessor.processSignal(filtered);
        
        if (vitalSigns.isValid) {
          heartRate = vitalSigns.bpm;
          confidence = vitalSigns.confidence;
          
          console.log("PPGSignalProcessor: Vital signs calculados", {
            heartRate,
            confidence,
            quality,
            isValid: vitalSigns.isValid,
            peaks: vitalSigns.peaks.length
          });
        }
      }

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        heartRate: heartRate,
        confidence: confidence,
        roi: this.detectROI(imageData)
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
    
    // Ajustado para analizar una región más precisa
    const startX = Math.floor(imageData.width * 0.4);
    const endX = Math.floor(imageData.width * 0.6);
    const startY = Math.floor(imageData.height * 0.4);
    const endY = Math.floor(imageData.height * 0.6);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];
        count++;
      }
    }
    
    const avgRed = redSum / count;
    console.log("Valor promedio de rojo:", avgRed);
    return avgRed;
  }

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const isInRange = rawValue >= this.MIN_RED_THRESHOLD && rawValue <= this.MAX_RED_THRESHOLD;
    console.log("Análisis de rango:", { rawValue, isInRange, min: this.MIN_RED_THRESHOLD, max: this.MAX_RED_THRESHOLD });
    
    if (!isInRange) {
      this.stableFrameCount = 0;
      return { isFingerDetected: false, quality: 0 };
    }

    if (this.lastValues.length < this.STABILITY_WINDOW) {
      return { isFingerDetected: false, quality: 0 };
    }

    const recentValues = this.lastValues.slice(-this.STABILITY_WINDOW);
    const avgVariation = recentValues.reduce((sum, val, i, arr) => {
      if (i === 0) return 0;
      return sum + Math.abs(val - arr[i-1]);
    }, 0) / (recentValues.length - 1);

    const isStable = avgVariation < 5;
    console.log("Análisis de estabilidad:", { avgVariation, isStable, stableFrameCount: this.stableFrameCount });

    if (isStable) {
      this.stableFrameCount++;
      this.lastStableValue = filtered;
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
    }

    const isFingerDetected = this.stableFrameCount >= this.MIN_STABILITY_COUNT;
    
    let quality = 0;
    if (isFingerDetected) {
      const stabilityScore = Math.min(this.stableFrameCount / 10, 1);
      const intensityScore = Math.min((rawValue - this.MIN_RED_THRESHOLD) / 
                                    (this.MAX_RED_THRESHOLD - this.MIN_RED_THRESHOLD), 1);
      quality = Math.round((stabilityScore * 0.7 + intensityScore * 0.3) * 100);
    }

    console.log("Resultado final:", { isFingerDetected, quality });
    return { isFingerDetected, quality };
  }

  private detectROI(imageData: ImageData): ProcessedSignal['roi'] {
    return {
      x: Math.floor(imageData.width * 0.4),
      y: Math.floor(imageData.height * 0.4),
      width: Math.floor(imageData.width * 0.2),
      height: Math.floor(imageData.height * 0.2)
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
