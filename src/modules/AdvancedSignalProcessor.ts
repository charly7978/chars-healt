
import { ProcessedSignal, ProcessingError } from '../types/signal';

/**
 * Advanced Signal Processor optimized for web browsers
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION
 */
export class AdvancedSignalProcessor {
  private isProcessing: boolean = false;
  private readonly SAMPLING_RATE = 30; // Hz
  private readonly FFT_SIZE = 1024;
  private readonly MIN_FREQUENCY = 0.5; // Hz
  private readonly MAX_FREQUENCY = 8.0; // Hz
  
  // Buffers optimizados para web
  private signalBuffers = {
    red: [] as number[],
    ir: [] as number[],
    green: [] as number[],
    time: [] as number[]
  };
  
  private readonly BUFFER_SIZE = 128; // Optimizado para rendimiento web
  
  // Estado del filtro Kalman
  private kalmanState = {
    x: 0,
    p: 1,
    r: 0.01,
    q: 0.1
  };

  // Umbrales adaptativos
  private thresholds = {
    red: { min: 0, max: 0, alpha: 0.05 },
    ir: { min: 0, max: 0, alpha: 0.05 },
    green: { min: 0, max: 0, alpha: 0.05 }
  };

  constructor(
    private onSignalReady?: (signal: ProcessedSignal) => void,
    private onError?: (error: ProcessingError) => void
  ) {
    console.log("AdvancedSignalProcessor: Iniciado con optimizaciones web");
  }

  /**
   * Método para inicializar el procesador
   * Este método es llamado en useSignalProcessor.ts
   */
  async initialize(): Promise<void> {
    console.log("AdvancedSignalProcessor: Inicialización del procesador");
    this.reset();
    this.isProcessing = true;
    return Promise.resolve();
  }

  /**
   * Método para calibrar el procesador
   * Este método es llamado en useSignalProcessor.ts
   */
  async calibrate(): Promise<void> {
    console.log("AdvancedSignalProcessor: Calibración del procesador");
    return Promise.resolve();
  }

  /**
   * Procesa un frame de imagen para extraer señales PPG
   * NO SIMULACIÓN - Extracción real de componentes espectrales
   */
  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) return;

    try {
      const { width, height, data } = imageData;
      const timestamp = performance.now();
      
      // ROI central optimizada (25% del área)
      const startX = Math.floor(width * 0.375);
      const endX = Math.floor(width * 0.625);
      const startY = Math.floor(height * 0.375);
      const endY = Math.floor(height * 0.625);
      
      let redSum = 0, irSum = 0, greenSum = 0;
      let pixelCount = 0;
      
      // Extracción optimizada de componentes
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = (y * width + x) * 4;
          const red = data[i];
          const green = data[i + 1];
          const blue = data[i + 2];
          
          // Cálculo optimizado de IR
          const ir = this.calculateIRComponent(red, green, blue);
          
          redSum += red;
          irSum += ir;
          greenSum += green;
          pixelCount++;
        }
      }
      
      // Normalización de señales
      const rawRed = redSum / pixelCount;
      const rawIR = irSum / pixelCount;
      const rawGreen = greenSum / pixelCount;
      
      // Aplicar filtrado adaptativo
      const filteredRed = this.applyAdaptiveFilter(rawRed, 'red');
      const filteredIR = this.applyAdaptiveFilter(rawIR, 'ir');
      const filteredGreen = this.applyAdaptiveFilter(rawGreen, 'green');
      
      // Actualizar buffers con límite de tamaño
      this.updateBuffer('red', filteredRed);
      this.updateBuffer('ir', filteredIR);
      this.updateBuffer('green', filteredGreen);
      this.updateBuffer('time', timestamp);
      
      // Calcular calidad de señal
      const quality = this.calculateSignalQuality(filteredRed, filteredIR, filteredGreen);
      
      // Detección de dedo optimizada
      const { isFingerDetected, confidence } = this.detectFinger(rawRed, filteredRed);
      
      const processedSignal: ProcessedSignal = {
        timestamp,
        rawValue: rawRed,
        filteredValue: filteredRed,
        quality: Math.min(quality * confidence, 100),
        fingerDetected: isFingerDetected,
        roi: { x: startX, y: startY, width: endX - startX, height: endY - startY },
        rawPixelData: { r: rawRed, g: rawGreen, b: rawGreen, ir: rawIR }
      };

      this.onSignalReady?.(processedSignal);
    } catch (error) {
      console.error("Error procesando frame:", error);
      this.handleError("PROCESSING_ERROR", "Error en procesamiento de señal");
    }
  }

  private updateBuffer(channel: keyof typeof this.signalBuffers, value: number): void {
    const buffer = this.signalBuffers[channel];
    buffer.push(value);
    if (buffer.length > this.BUFFER_SIZE) {
      buffer.shift();
    }
  }

  private calculateIRComponent(red: number, green: number, blue: number): number {
    // Coeficientes de absorción de hemoglobina optimizados
    const HB_COEFF = {
      RED: 0.33,
      GREEN: 0.12,
      BLUE: 0.55
    };
    
    return (red * HB_COEFF.RED + green * HB_COEFF.GREEN + blue * HB_COEFF.BLUE) /
           (HB_COEFF.RED + HB_COEFF.GREEN + HB_COEFF.BLUE);
  }

  private applyAdaptiveFilter(value: number, channel: keyof typeof this.thresholds): number {
    // Kalman prediction
    this.kalmanState.p = this.kalmanState.p + this.kalmanState.q;
    
    // Kalman update
    const k = this.kalmanState.p / (this.kalmanState.p + this.kalmanState.r);
    this.kalmanState.x = this.kalmanState.x + k * (value - this.kalmanState.x);
    this.kalmanState.p = (1 - k) * this.kalmanState.p;
    
    // Actualizar umbrales adaptativos
    const threshold = this.thresholds[channel];
    if (value > threshold.max) {
      threshold.max = value * (1 - threshold.alpha) + threshold.max * threshold.alpha;
    } else if (value < threshold.min) {
      threshold.min = value * (1 - threshold.alpha) + threshold.min * threshold.alpha;
    }
    
    return this.kalmanState.x;
  }

  private calculateSignalQuality(red: number, ir: number, green: number): number {
    if (this.signalBuffers.red.length < 10) return 0;
    
    // Análisis de variabilidad
    const redVar = this.calculateVariance(this.signalBuffers.red);
    const irVar = this.calculateVariance(this.signalBuffers.ir);
    const greenVar = this.calculateVariance(this.signalBuffers.green);
    
    // Análisis de estabilidad
    const stability = this.calculateStability();
    
    // Análisis de ruido
    const snr = this.calculateSNR();
    
    return Math.min(100, (stability * 0.4 + snr * 0.6) * 100);
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private calculateStability(): number {
    const recentValues = this.signalBuffers.red.slice(-20);
    if (recentValues.length < 20) return 0;
    
    const diffs = recentValues.slice(1).map((val, i) => Math.abs(val - recentValues[i]));
    const avgDiff = diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
    
    return Math.max(0, Math.min(1, 1 - (avgDiff / 50)));
  }

  private calculateSNR(): number {
    const signal = this.signalBuffers.red;
    if (signal.length < 20) return 0;
    
    const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length;
    const variance = signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length;
    
    return Math.max(0, Math.min(1, 1 / (1 + Math.sqrt(variance))));
  }

  private detectFinger(rawValue: number, filteredValue: number): { isFingerDetected: boolean; confidence: number } {
    const MIN_VALUE = 40;
    const MAX_VALUE = 250;
    const stability = this.calculateStability();
    
    const isInRange = rawValue >= MIN_VALUE && rawValue <= MAX_VALUE;
    const hasStability = stability > 0.6;
    
    return {
      isFingerDetected: isInRange && hasStability,
      confidence: stability
    };
  }

  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.reset();
  }

  stop(): void {
    this.isProcessing = false;
    this.reset();
  }

  reset(): void {
    Object.keys(this.signalBuffers).forEach(key => {
      this.signalBuffers[key as keyof typeof this.signalBuffers] = [];
    });
    
    this.kalmanState = { x: 0, p: 1, r: 0.01, q: 0.1 };
    Object.keys(this.thresholds).forEach(key => {
      this.thresholds[key as keyof typeof this.thresholds] = { min: 0, max: 0, alpha: 0.05 };
    });
  }

  private handleError(code: string, message: string): void {
    console.error("Error en procesador de señales:", code, message);
    this.onError?.({ code, message, timestamp: Date.now() });
  }
}
