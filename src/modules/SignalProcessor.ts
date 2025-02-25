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
    BUFFER_SIZE: 4,           // Aumentado para mejor estabilidad
    MIN_RED_THRESHOLD: 30,     // Reducido aún más para mejorar detección
    MAX_RED_THRESHOLD: 350,    // Aumentado para captar señales más intensas
    STABILITY_WINDOW: 10,       // Reducido para respuesta más rápida
    MIN_STABILITY_COUNT: 2,    // Reducido para confirmar estabilidad más rápido
    HYSTERESIS: 15,            // Aumentado para evitar fluctuaciones
    MIN_CONSECUTIVE_DETECTIONS: 1  // Mantener en 1 para detección inmediata
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 300; // Reducido a 300ms para respuesta más rápida
  private redValues: number[] = []; // Historial de valores rojos para análisis

  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instancia creada con configuración:", this.currentConfig);
  }

  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.redValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.consecutiveDetections = 0;
      this.isCurrentlyDetected = false;
      this.lastDetectionTime = 0;
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
    this.redValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.kalmanFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await this.initialize();
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
      return;
    }

    try {
      const { redValue, redDominance } = this.extractRedChannel(imageData);
      
      // Almacenar valores para análisis
      this.redValues.push(redValue);
      if (this.redValues.length > 30) {
        this.redValues.shift();
      }
      
      // Aplicar filtro Kalman solo si el valor es razonable
      let filtered = 0;
      if (redValue > 0) {
        filtered = this.kalmanFilter.filter(redValue);
      } else {
        // Si no hay señal, usar un valor bajo pero no cero para mantener continuidad
        filtered = this.lastValues.length > 0 ? this.lastValues[this.lastValues.length - 1] * 0.5 : 0;
        if (filtered < 1) filtered = 0;
      }
      
      this.lastValues.push(filtered);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
      }

      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue, redDominance);

      // Log detallado solo cuando hay cambios significativos o cada 30 frames
      if (Math.random() < 0.03 || isFingerDetected !== this.isCurrentlyDetected) {
        console.log("PPGSignalProcessor: Análisis", {
          redValue,
          filtered,
          redDominance,
          isFingerDetected,
          quality,
          stableFrames: this.stableFrameCount
        });
      }

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        redValue: redValue, // Añadir valor rojo para depuración
        roi: this.detectROI(redValue)
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error al procesar frame");
    }
  }

  private extractRedChannel(imageData: ImageData): { redValue: number, redDominance: number } {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    
    // Ampliar la región de interés para capturar más área del dedo
    const startX = Math.floor(imageData.width * 0.25);
    const endX = Math.floor(imageData.width * 0.75);
    const startY = Math.floor(imageData.height * 0.25);
    const endY = Math.floor(imageData.height * 0.75);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * imageData.width + x) * 4;
        redSum += data[i];     // Canal rojo
        greenSum += data[i+1]; // Canal verde
        blueSum += data[i+2];  // Canal azul
        count++;
      }
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Calcular dominancia del rojo (qué tanto domina sobre los otros canales)
    const redGreenRatio = avgRed / (avgGreen || 1);
    const redBlueRatio = avgRed / (avgBlue || 1);
    const redDominance = Math.min(redGreenRatio, redBlueRatio);
    
    // Reducir el umbral de dominancia del rojo para mejorar detección
    const isRedDominant = redDominance > 1.05;
    
    // Añadir log para depuración cada 30 frames aproximadamente
    if (Math.random() < 0.03) {
      console.log("PPGSignalProcessor: Valores RGB", { 
        avgRed, 
        avgGreen, 
        avgBlue, 
        redDominance,
        isRedDominant,
        threshold: this.currentConfig.MIN_RED_THRESHOLD
      });
    }
    
    return {
      redValue: isRedDominant ? avgRed : 0,
      redDominance: redDominance
    };
  }

  private analyzeSignal(filtered: number, rawValue: number, redDominance: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Verificar si el valor está dentro del rango válido con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD;

    // Verificar dominancia del rojo (más sensible si ya estamos detectando)
    const hasRedDominance = redDominance > (this.isCurrentlyDetected ? 1.03 : 1.05);

    if (!inRange || !hasRedDominance) {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analizar estabilidad de la señal
    const stability = this.calculateStability();
    if (stability > 0.6) { // Reducido para ser más permisivo
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 0.5);
    }

    // Actualizar estado de detección
    const isStableNow = this.stableFrameCount >= this.currentConfig.MIN_STABILITY_COUNT;

    if (isStableNow) {
      this.consecutiveDetections++;
      if (this.consecutiveDetections >= this.currentConfig.MIN_CONSECUTIVE_DETECTIONS) {
        this.isCurrentlyDetected = true;
        this.lastDetectionTime = currentTime;
      }
    } else if (this.consecutiveDetections > 0) {
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 0.5);
    }

    // Calcular calidad de la señal
    const stabilityScore = this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2);
    const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                  (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
    const dominanceScore = Math.min((redDominance - 1) / 0.5, 1);
    
    // Calidad ponderada con más peso en dominancia del rojo
    const quality = Math.round((stabilityScore * 0.4 + intensityScore * 0.3 + dominanceScore * 0.3) * 100);

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  private calculateStability(): number {
    if (this.lastValues.length < 2) return 0;
    
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    const avgVariation = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    const maxValue = Math.max(...this.lastValues);
    
    if (maxValue === 0) return 0;
    
    // Normalizar variación respecto al valor máximo
    const normalizedVariation = avgVariation / maxValue;
    
    // Convertir a puntuación de estabilidad (0-1)
    return Math.max(0, 1 - normalizedVariation * 10);
  }

  private detectROI(redValue: number): { x: number, y: number, width: number, height: number } {
    // Implementación simple de ROI basada en el centro de la imagen
    return {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5
    };
  }

  private handleError(code: string, message: string): void {
    const error: ProcessingError = {
      code,
      message,
      timestamp: Date.now()
    };
    
    console.error(`PPGSignalProcessor: Error ${code} - ${message}`);
    this.onError?.(error);
  }
}
