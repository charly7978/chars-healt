
// Web Worker para procesamiento de señal PPG
// Esto libera el hilo principal y mejora el rendimiento general

const ctx: Worker = self as any;

// Interfaz para los mensajes entre el worker y el hilo principal
interface WorkerMessage {
  type: 'processFrame' | 'initialize' | 'stop' | 'calibrate';
  data?: any;
}

interface ProcessedSignal {
  timestamp: number;
  rawValue: number;
  filteredValue: number;
  quality: number;
  fingerDetected: boolean;
  roi: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Implementación simplificada del filtro Kalman para usar en el worker
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

// Sistema de procesamiento interno del worker
class SignalWorkerProcessor {
  private kalmanFilter: KalmanFilter;
  private lastValues: number[] = [];
  private readonly CONFIG = {
    BUFFER_SIZE: 15,
    MIN_RED_THRESHOLD: 40,
    MAX_RED_THRESHOLD: 250,
    STABILITY_WINDOW: 6,
    MIN_STABILITY_COUNT: 4,
    HYSTERESIS: 5,
    MIN_CONSECUTIVE_DETECTIONS: 3
  };
  
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500;
  private isProcessing: boolean = false;

  constructor() {
    this.kalmanFilter = new KalmanFilter();
    this.initialize();
  }

  async initialize(): Promise<void> {
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.lastDetectionTime = 0;
    this.kalmanFilter.reset();
    this.isProcessing = true;
  }

  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.kalmanFilter.reset();
    
    // Forzar limpieza de memoria
    this.lastValues.length = 0;
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        console.log('No se pudo forzar la recolección de basura');
      }
    }
  }

  async calibrate(): Promise<boolean> {
    await this.initialize();
    return true;
  }

  processFrame(imageData: ImageData): ProcessedSignal | null {
    if (!this.isProcessing) return null;

    try {
      // Extracción de la señal PPG optimizada
      const redValue = this.extractRedChannel(imageData);
      const filtered = this.kalmanFilter.filter(redValue);
      
      // Compresión de datos - solo almacenar cada segundo valor
      // Esto reduce a la mitad la memoria usada sin afectar significativamente la calidad
      if (this.lastValues.length % 2 === 0) {
        this.lastValues.push(filtered);
      }
      
      if (this.lastValues.length > this.CONFIG.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue)
      };

      return processedSignal;
    } catch (error) {
      console.error("Error procesando frame en worker:", error);
      return null;
    }
  }

  private extractRedChannel(imageData: ImageData): number {
    // Método optimizado para extraer canal rojo con menor costo computacional
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    
    // Usar región central para mejor señal (25% del centro)
    const startX = Math.floor(imageData.width * 0.375);
    const endX = Math.floor(imageData.width * 0.625);
    const startY = Math.floor(imageData.height * 0.375);
    const endY = Math.floor(imageData.height * 0.625);
    
    // Optimización: muestrear solo 1 de cada 4 píxeles
    // Esto reduce el procesamiento al 25% sin perder precisión significativa
    for (let y = startY; y < endY; y += 2) {
      for (let x = startX; x < endX; x += 2) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];
        greenSum += data[i+1];
        blueSum += data[i+2];
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Verificar dominancia del canal rojo
    const isRedDominant = avgRed > (avgGreen * 1.2) && avgRed > (avgBlue * 1.2);
    
    return isRedDominant ? avgRed : 0;
  }

  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Verificar si el valor está dentro del rango válido con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.CONFIG.MIN_RED_THRESHOLD - this.CONFIG.HYSTERESIS) &&
        rawValue <= (this.CONFIG.MAX_RED_THRESHOLD + this.CONFIG.HYSTERESIS)
      : rawValue >= this.CONFIG.MIN_RED_THRESHOLD &&
        rawValue <= this.CONFIG.MAX_RED_THRESHOLD;

    if (!inRange) {
      this.consecutiveDetections = 0;
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analizar estabilidad de la señal - simplificado para mejor rendimiento
    const stability = this.calculateStability();
    if (stability > 0.7) {
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.CONFIG.MIN_STABILITY_COUNT * 2
      );
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 0.5);
    }

    // Actualizar estado de detección
    const isStableNow = this.stableFrameCount >= this.CONFIG.MIN_STABILITY_COUNT;

    if (isStableNow) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.CONFIG.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
    }

    // Calcular calidad de la señal - método simplificado
    const stabilityScore = this.stableFrameCount / (this.CONFIG.MIN_STABILITY_COUNT * 2);
    const intensityScore = Math.min((rawValue - this.CONFIG.MIN_RED_THRESHOLD) / 
                                  (this.CONFIG.MAX_RED_THRESHOLD - this.CONFIG.MIN_RED_THRESHOLD), 1);
    
    const quality = Math.round((stabilityScore * 0.6 + intensityScore * 0.4) * 100);

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  private calculateStability(): number {
    if (this.lastValues.length < 2) return 0;
    
    // Cálculo de estabilidad optimizado
    const variations = [];
    let sumVariation = 0;
    
    for (let i = 1; i < this.lastValues.length; i++) {
      const variation = Math.abs(this.lastValues[i] - this.lastValues[i-1]);
      sumVariation += variation;
    }
    
    const avgVariation = sumVariation / (this.lastValues.length - 1);
    return Math.max(0, Math.min(1, 1 - (avgVariation / 50)));
  }

  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // Región de interés constante para simplificar
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    };
  }
}

// Instancia de procesador para el worker
const processor = new SignalWorkerProcessor();

// Listener para mensajes del hilo principal
ctx.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'initialize':
      await processor.initialize();
      ctx.postMessage({ type: 'initialized' });
      break;
      
    case 'stop':
      processor.stop();
      ctx.postMessage({ type: 'stopped' });
      break;
      
    case 'calibrate':
      const success = await processor.calibrate();
      ctx.postMessage({ type: 'calibrated', success });
      break;
      
    case 'processFrame':
      const result = processor.processFrame(data.imageData);
      if (result) {
        // Transferir solo datos necesarios para reducir costo de serialización
        ctx.postMessage({ 
          type: 'signalProcessed', 
          signal: result 
        });
      }
      break;
      
    default:
      console.error('Mensaje desconocido recibido en worker:', type);
  }
});

// Notificar que el worker está listo
ctx.postMessage({ type: 'ready' });

export {};
