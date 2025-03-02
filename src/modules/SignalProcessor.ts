import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

// Clase mejorada de filtro Kalman para reducción de ruido
class KalmanFilter {
  private R: number = 0.008;  // Measurement noise (reduced from 0.01)
  private Q: number = 0.08;   // Process noise (reduced from 0.1)
  private P: number = 1;      // Error covariance
  private X: number = 0;      // State estimate
  private K: number = 0;      // Kalman gain

  /**
   * Apply Kalman filter to a measurement
   */
  filter(measurement: number): number {
    // Prediction update
    this.P = this.P + this.Q;
    
    // Measurement update
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    
    return this.X;
  }

  /**
   * Reset filter state
   */
  reset() {
    this.X = 0;
    this.P = 1;
  }
}

// Nuevo: Filtro Butterworth para complementar Kalman
class ButterworthFilter {
  private readonly a: number[] = [1, -1.5784, 0.6126];
  private readonly b: number[] = [0.0086, 0.0172, 0.0086];
  private readonly order: number = 2;
  private inputs: number[] = [0, 0, 0];
  private outputs: number[] = [0, 0, 0];

  filter(value: number): number {
    // Shift input and output buffers
    for (let i = this.order; i > 0; i--) {
      this.inputs[i] = this.inputs[i-1];
      this.outputs[i] = this.outputs[i-1];
    }
    
    // Process new value
    this.inputs[0] = value;
    this.outputs[0] = this.b[0] * this.inputs[0];
    
    for (let i = 1; i <= this.order; i++) {
      this.outputs[0] += this.b[i] * this.inputs[i] - this.a[i] * this.outputs[i];
    }
    
    return this.outputs[0];
  }

  reset(): void {
    this.inputs = [0, 0, 0];
    this.outputs = [0, 0, 0];
  }
}

/**
 * PPG Signal Processor implementation
 * Procesa frames de cámara para extraer y analizar señales PPG
 */
export class PPGSignalProcessor implements SignalProcessor {
  private isProcessing: boolean = false;
  private kalmanFilter: KalmanFilter;
  private butterFilter: ButterworthFilter;
  private lastValues: number[] = [];
  
  // Configuración optimizada
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 15,               // Buffer para análisis de señal
    MIN_RED_THRESHOLD: 35,         // Umbral mínimo para canal rojo (bajado para mayor sensibilidad)
    MAX_RED_THRESHOLD: 250,        // Umbral máximo para canal rojo
    STABILITY_WINDOW: 6,           // Ventana para análisis de estabilidad
    MIN_STABILITY_COUNT: 5,        // Cantidad de frames estables requeridos
    HYSTERESIS: 5,                 // Histéresis para evitar fluctuaciones
    MIN_CONSECUTIVE_DETECTIONS: 4, // Detecciones consecutivas requeridas
    QUALITY_THRESHOLD_POOR: 30,    // Umbral para calidad pobre
    QUALITY_THRESHOLD_ACCEPTABLE: 50, // Umbral para calidad aceptable
    QUALITY_THRESHOLD_GOOD: 75     // Umbral para buena calidad
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500; // 500ms timeout
  
  // NUEVO: Buffer para análisis avanzado de señal
  private rawRedValues: number[] = [];
  private dcComponent: number = 0;
  private acComponent: number = 0;
  private perfusionIndex: number = 0;

  /**
   * Constructor
   */
  constructor(
    public onSignalReady?: (signal: ProcessedSignal) => void,
    public onError?: (error: ProcessingError) => void
  ) {
    this.kalmanFilter = new KalmanFilter();
    this.butterFilter = new ButterworthFilter();
    this.currentConfig = { ...this.DEFAULT_CONFIG };
    console.log("PPGSignalProcessor: Instancia creada con filtrado optimizado");
  }

  /**
   * Inicializar procesador
   */
  async initialize(): Promise<void> {
    try {
      this.lastValues = [];
      this.rawRedValues = [];
      this.stableFrameCount = 0;
      this.lastStableValue = 0;
      this.consecutiveDetections = 0;
      this.isCurrentlyDetected = false;
      this.lastDetectionTime = 0;
      this.kalmanFilter.reset();
      this.butterFilter.reset();
      this.dcComponent = 0;
      this.acComponent = 0;
      this.perfusionIndex = 0;
      console.log("PPGSignalProcessor: Inicializado");
    } catch (error) {
      console.error("PPGSignalProcessor: Error de inicialización", error);
      this.handleError("INIT_ERROR", "Error inicializando procesador");
    }
  }

  /**
   * Iniciar procesamiento
   */
  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.initialize();
    console.log("PPGSignalProcessor: Iniciado");
  }

  /**
   * Detener procesamiento
   */
  stop(): void {
    this.isProcessing = false;
    this.lastValues = [];
    this.rawRedValues = [];
    this.stableFrameCount = 0;
    this.lastStableValue = 0;
    this.consecutiveDetections = 0;
    this.isCurrentlyDetected = false;
    this.kalmanFilter.reset();
    this.butterFilter.reset();
    console.log("PPGSignalProcessor: Detenido");
  }

  /**
   * Calibrar procesador
   */
  async calibrate(): Promise<boolean> {
    try {
      console.log("PPGSignalProcessor: Iniciando calibración");
      await this.initialize();
      console.log("PPGSignalProcessor: Calibración completada");
      return true;
    } catch (error) {
      console.error("PPGSignalProcessor: Error de calibración", error);
      this.handleError("CALIBRATION_ERROR", "Error durante calibración");
      return false;
    }
  }

  /**
   * Procesar un frame de cámara
   */
  processFrame(imageData: ImageData): void {
    if (!this.isProcessing) {
      console.log("PPGSignalProcessor: No procesando");
      return;
    }

    try {
      // Extraer señal PPG optimizada para ROI central
      const { redValue, greenValue, blueValue } = this.extractOptimizedPPG(imageData);
      
      // NUEVO: Calcular proporción rojo/infrarrojo para SpO2
      const redToIR = redValue / (greenValue + blueValue + 0.01);
      
      // Aplicar filtrado secuencial optimizado:
      // 1. Filtro Butterworth para eliminación de ruido de alta frecuencia
      const butterFiltered = this.butterFilter.filter(redValue);
      // 2. Filtro Kalman para seguimiento de señal y eliminación de ruido
      const filtered = this.kalmanFilter.filter(butterFiltered);
      
      this.lastValues.push(filtered);
      this.rawRedValues.push(redValue);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
        this.rawRedValues.shift();
      }

      // NUEVO: Actualizar componentes AC y DC para cálculos de SpO2
      this.updateACDCComponents();
      
      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue);

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue),
        // NUEVO: Proporcionar datos adicionales para cálculos avanzados
        redToIR: redToIR,
        ac: this.acComponent,
        dc: this.dcComponent,
        perfusionIndex: this.perfusionIndex
      };

      this.onSignalReady?.(processedSignal);

    } catch (error) {
      console.error("PPGSignalProcessor: Error procesando frame", error);
      this.handleError("PROCESSING_ERROR", "Error procesando frame");
    }
  }

  /**
   * MEJORADO: Extracción optimizada de señal PPG con ROI adaptativo
   */
  private extractOptimizedPPG(imageData: ImageData): { redValue: number, greenValue: number, blueValue: number } {
    const data = imageData.data;
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    
    // ROI optimizado: usar solo el centro (25%) con ponderación gaussiana
    // para dar más importancia al centro absoluto
    const width = imageData.width;
    const height = imageData.height;
    
    // Definir región central para análisis principal
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const radius = Math.min(width, height) * 0.175; // Reducido para mayor especificidad
    
    // Análisis adaptativo de ROI
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Calcular distancia al centro (ponderación gaussiana)
        const distSq = Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2);
        const distRatio = distSq / (radius * radius);
        
        // Solo procesar píxeles dentro del radio con ponderación
        if (distRatio <= 1.0) {
          const i = (y * width + x) * 4;
          
          // Peso gaussiano: mayor prioridad al centro absoluto
          const weight = Math.exp(-2.0 * distRatio);
          
          redSum += data[i] * weight;     // Canal rojo
          greenSum += data[i+1] * weight; // Canal verde
          blueSum += data[i+2] * weight;  // Canal azul
          count += weight;
        }
      }
    }
    
    if (count === 0) {
      return { redValue: 0, greenValue: 0, blueValue: 0 };
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;

    // Análisis mejorado de dominancia de rojo (característica de tejido con sangre)
    // Mejora la detección del dedo usando múltiples criterios
    const isRedDominant = (
      avgRed > (avgGreen * 1.30) && // Aumentado de 1.25 a 1.30
      avgRed > (avgBlue * 1.35) && // Aumentado de 1.25 a 1.35
      avgRed > 30 // Mínimo valor absoluto para detección válida
    );
    
    // NUEVO: Calcular índice de "rojez" como métrica de calidad
    const rednessIndex = avgRed / ((avgGreen + avgBlue) / 2);
    
    // Retornar valores solo si se detecta dedo, sino retornar 0
    if (isRedDominant) {
      return { 
        redValue: avgRed, 
        greenValue: avgGreen,
        blueValue: avgBlue
      };
    }
    
    return { redValue: 0, greenValue: 0, blueValue: 0 };
  }
  
  /**
   * NUEVO: Actualizar componentes AC y DC de la señal
   */
  private updateACDCComponents(): void {
    if (this.rawRedValues.length < 10) return;
    
    // Usar últimos valores de la ventana
    const recentValues = this.rawRedValues.slice(-10);
    
    // DC es aproximadamente el valor mínimo (línea base)
    this.dcComponent = Math.min(...recentValues);
    
    // AC es la amplitud pico a pico
    const maxValue = Math.max(...recentValues);
    this.acComponent = maxValue - this.dcComponent;
    
    // Calcular índice de perfusión: AC/DC * 100%
    this.perfusionIndex = (this.dcComponent > 0) ? 
      (this.acComponent / this.dcComponent) * 100 : 0;
  }

  /**
   * Analizar señal para detección de dedo y evaluación de calidad
   */
  private analyzeSignal(filtered: number, rawValue: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // Verificar si el valor está dentro del rango válido con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (this.currentConfig.MIN_RED_THRESHOLD - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= this.currentConfig.MIN_RED_THRESHOLD &&
        rawValue <= this.currentConfig.MAX_RED_THRESHOLD;

    if (!inRange) {
      this.consecutiveDetections = 0;
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
      
      if (timeSinceLastDetection > this.DETECTION_TIMEOUT) {
        this.isCurrentlyDetected = false;
      }
      
      return { isFingerDetected: this.isCurrentlyDetected, quality: 0 };
    }

    // Analizar estabilidad de la señal - criterio mejorado
    const stability = this.calculateStability();
    if (stability > 0.78) { // Aumentado de 0.75 a 0.78 para mayor exigencia
      this.stableFrameCount = Math.min(
        this.stableFrameCount + 1,
        this.currentConfig.MIN_STABILITY_COUNT * 2
      );
    } else {
      // Disminución más gradual para estabilidad
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
    } else {
      // Disminución más gradual para detecciones consecutivas
      this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
    }

    // Algoritmo mejorado para calcular calidad de señal
    // Basado en técnicas de análisis de señal fotopletismográfica
    const stabilityScore = this.stableFrameCount / (this.currentConfig.MIN_STABILITY_COUNT * 2);
    const intensityScore = Math.min((rawValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD), 1);
    
    // NUEVO: Incorporar índice de perfusión en la evaluación de calidad
    const perfusionScore = Math.min(this.perfusionIndex / 5.0, 1.0);
    
    // Calidad ponderada con más énfasis en estabilidad y perfusión
    let quality = Math.round((stabilityScore * 0.5 + intensityScore * 0.25 + perfusionScore * 0.25) * 100);
    
    // Transiciones más graduales entre niveles de calidad
    if (quality < this.currentConfig.QUALITY_THRESHOLD_POOR) {
      // Calidad muy baja, mantener como está
      quality = quality;
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE) {
      // Rango de calidad pobre pero detectable
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_POOR + 5, quality);
    } else if (quality < this.currentConfig.QUALITY_THRESHOLD_GOOD) {
      // Rango de calidad aceptable
      quality = Math.max(this.currentConfig.QUALITY_THRESHOLD_ACCEPTABLE + 3, quality);
    } else {
      // Buena calidad, mantener como está
      quality = quality;
    }

    return {
      isFingerDetected: this.isCurrentlyDetected,
      quality: this.isCurrentlyDetected ? quality : 0
    };
  }

  /**
   * Cálculo mejorado de estabilidad de la señal
   */
  private calculateStability(): number {
    if (this.lastValues.length < 2) return 0;
    
    // Análisis avanzado de estabilidad basado en investigación
    // Usar ventana deslizante para análisis de variaciones
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    // Calcular desviación estándar normalizada
    const mean = variations.reduce((sum, val) => sum + val, 0) / variations.length;
    const stdDev = Math.sqrt(
      variations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / variations.length
    );
    
    // Índice de estabilidad normalizado inversamente proporcional a la variabilidad
    const variationCoefficient = mean > 0 ? stdDev / mean : 1;
    const stabilityScore = Math.max(0, Math.min(1, 1 - (variationCoefficient * 2)));
    
    return stabilityScore;
  }

  /**
   * Detectar región de interés
   */
  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // ROI adaptativo basado en la intensidad de la señal
    const signalStrength = Math.min(1, Math.max(0, (redValue - this.currentConfig.MIN_RED_THRESHOLD) / 
                                 (this.currentConfig.MAX_RED_THRESHOLD - this.currentConfig.MIN_RED_THRESHOLD)));
    
    // Tamaño de ROI proporcional a la fuerza de la señal
    const size = 50 + Math.round(signalStrength * 50);
    
    return {
      x: 50 - size/2,
      y: 50 - size/2,
      width: size,
      height: size
    };
  }

  /**
   * Manejar errores del procesador
   */
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
