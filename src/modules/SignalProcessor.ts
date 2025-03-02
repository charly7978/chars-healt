import { ProcessedSignal, ProcessingError, SignalProcessor } from '../types/signal';

// Clase mejorada de filtro Kalman para reducción de ruido
class KalmanFilter {
  private R: number = 0.006;  // Measurement noise (reduced from 0.008 for more responsiveness)
  private Q: number = 0.06;   // Process noise (reduced from 0.08 for more responsiveness)
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

// Filtro Butterworth para complementar Kalman
class ButterworthFilter {
  // Ajustados para mejor respuesta en frecuencia (menos suavizado)
  private readonly a: number[] = [1, -1.4784, 0.5126];
  private readonly b: number[] = [0.0106, 0.0212, 0.0106];
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
  
  // Configuración optimizada - AJUSTADOS para mayor sensibilidad
  private readonly DEFAULT_CONFIG = {
    BUFFER_SIZE: 20,               // Aumentado de 15 a 20
    MIN_RED_THRESHOLD: 30,         // Reducido de 35 a 30 para mayor sensibilidad
    MAX_RED_THRESHOLD: 250,        // Mantenido en 250
    STABILITY_WINDOW: 5,           // Reducido de 6 a 5 para respuesta más rápida
    MIN_STABILITY_COUNT: 4,        // Reducido de 5 a 4 para detección más rápida
    HYSTERESIS: 5,                 // Mantenido en 5
    MIN_CONSECUTIVE_DETECTIONS: 3, // Reducido de 4 a 3 para detección más rápida
    QUALITY_THRESHOLD_POOR: 30,    // Mantenido en 30
    QUALITY_THRESHOLD_ACCEPTABLE: 50, // Mantenido en 50
    QUALITY_THRESHOLD_GOOD: 75     // Mantenido en 75
  };

  private currentConfig: typeof this.DEFAULT_CONFIG;
  private stableFrameCount: number = 0;
  private lastStableValue: number = 0;
  private consecutiveDetections: number = 0;
  private isCurrentlyDetected: boolean = false;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_TIMEOUT = 500; // 500ms timeout
  
  // Buffer para análisis avanzado de señal
  private rawRedValues: number[] = [];
  private rawGreenValues: number[] = [];
  private rawBlueValues: number[] = [];
  private dcComponent: number = 0;
  private acComponent: number = 0;
  private perfusionIndex: number = 0;
  
  // NUEVO: Variables para mejor extracción de señal
  private adaptiveRedThreshold: number = 0;
  private redRatios: number[] = [];
  private lastFrameQuality: number = 0;
  
  // NUEVO: Rastreo de calidad de señal por región
  private regionQualities: number[] = [];

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
      this.rawGreenValues = [];
      this.rawBlueValues = [];
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
      this.adaptiveRedThreshold = 0;
      this.redRatios = [];
      this.lastFrameQuality = 0;
      this.regionQualities = [];
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
    this.rawGreenValues = [];
    this.rawBlueValues = [];
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
      // Extraer señal PPG con ROI optimizada
      const { redValue, greenValue, blueValue, roiQuality } = this.extractOptimizedPPG(imageData);
      
      // Calcular proporción rojo/infrarrojo para SpO2
      const redToIR = redValue / (greenValue + blueValue + 0.01);
      
      // NUEVO: Actualizar ratio de rojo para análisis de tendencia
      this.updateRedRatio(redValue, greenValue, blueValue);
      
      // Aplicar filtrado secuencial optimizado:
      // 1. Filtro Butterworth para eliminación de ruido de alta frecuencia
      const butterFiltered = this.butterFilter.filter(redValue);
      // 2. Filtro Kalman para seguimiento de señal y eliminación de ruido
      const filtered = this.kalmanFilter.filter(butterFiltered);
      
      this.lastValues.push(filtered);
      this.rawRedValues.push(redValue);
      this.rawGreenValues.push(greenValue);
      this.rawBlueValues.push(blueValue);
      
      if (this.lastValues.length > this.currentConfig.BUFFER_SIZE) {
        this.lastValues.shift();
        this.rawRedValues.shift();
        this.rawGreenValues.shift();
        this.rawBlueValues.shift();
      }

      // Actualizar componentes AC y DC para cálculos de SpO2
      this.updateACDCComponents();
      
      const { isFingerDetected, quality } = this.analyzeSignal(filtered, redValue, roiQuality);
      
      // NUEVO: Almacenar calidad del frame actual
      this.lastFrameQuality = quality;

      const processedSignal: ProcessedSignal = {
        timestamp: Date.now(),
        rawValue: redValue,
        filteredValue: filtered,
        quality: quality,
        fingerDetected: isFingerDetected,
        roi: this.detectROI(redValue),
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
   * y análisis multi-región para encontrar la mejor señal
   */
  private extractOptimizedPPG(imageData: ImageData): { 
    redValue: number, 
    greenValue: number, 
    blueValue: number, 
    roiQuality: number 
  } {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // NUEVO: Dividir la imagen en regiones para analizar la mejor área
    const NUM_REGIONS = 5; // Examinar 5 regiones de interés
    const regions = [];
    
    // Definir regiones de interés para analizar
    
    // 1. Región central (prioritaria)
    regions.push({
      centerX: Math.floor(width / 2),
      centerY: Math.floor(height / 2),
      radiusRatio: 0.15,
      weight: 1.0
    });
    
    // 2. Cuatro regiones adicionales ligeramente desplazadas
    const offsets = [
      { x: -0.05, y: -0.05 }, // Superior izquierda
      { x: 0.05, y: -0.05 },  // Superior derecha
      { x: -0.05, y: 0.05 },  // Inferior izquierda
      { x: 0.05, y: 0.05 }    // Inferior derecha
    ];
    
    for (const offset of offsets) {
      regions.push({
        centerX: Math.floor(width * (0.5 + offset.x)),
        centerY: Math.floor(height * (0.5 + offset.y)),
        radiusRatio: 0.125,
        weight: 0.8
      });
    }
    
    // Análisis por regiones para encontrar la mejor señal
    const regionResults = regions.map((region, index) => {
      const { redValue, greenValue, blueValue, quality } = this.analyzeRegion(
        data, width, height, region.centerX, region.centerY, 
        Math.min(width, height) * region.radiusRatio
      );
      
      // Actualizar histórico de calidad por región
      if (this.regionQualities.length <= index) {
        this.regionQualities.push(quality);
      } else {
        // Actualización suavizada de calidad
        this.regionQualities[index] = this.regionQualities[index] * 0.7 + quality * 0.3;
      }
      
      return {
        redValue,
        greenValue,
        blueValue,
        quality: quality * region.weight // Aplicar peso de la región
      };
    });
    
    // Encontrar la región con mejor calidad
    let bestRegionIndex = 0;
    let bestQuality = 0;
    
    for (let i = 0; i < regionResults.length; i++) {
      const historicalQuality = this.regionQualities[i] || 0;
      const combinedQuality = historicalQuality * 0.7 + regionResults[i].quality * 0.3;
      
      if (combinedQuality > bestQuality) {
        bestQuality = combinedQuality;
        bestRegionIndex = i;
      }
    }
    
    const bestRegion = regionResults[bestRegionIndex];
    
    // Si la región es válida y tiene suficiente calidad
    if (bestRegion.quality > 0) {
      return {
        redValue: bestRegion.redValue,
        greenValue: bestRegion.greenValue,
        blueValue: bestRegion.blueValue,
        roiQuality: bestQuality
      };
    }
    
    // Si no se encontró una buena región, retornar valores cero
    return { redValue: 0, greenValue: 0, blueValue: 0, roiQuality: 0 };
  }
  
  /**
   * NUEVO: Analiza una región específica para extraer valores de color
   */
  private analyzeRegion(
    data: Uint8ClampedArray, 
    width: number, 
    height: number, 
    centerX: number, 
    centerY: number,
    radius: number
  ): { redValue: number, greenValue: number, blueValue: number, quality: number } {
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let count = 0;
    let pixelCount = 0;
    let validPixelCount = 0;
    
    // Análisis adaptativo de ROI con ponderación gaussiana
    for (let y = Math.max(0, centerY - radius); y < Math.min(height, centerY + radius); y++) {
      for (let x = Math.max(0, centerX - radius); x < Math.min(width, centerX + radius); x++) {
        // Calcular distancia al centro (ponderación gaussiana)
        const distSq = Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2);
        const distRatio = distSq / (radius * radius);
        
        pixelCount++;
        
        // Solo procesar píxeles dentro del radio con ponderación
        if (distRatio <= 1.0) {
          const i = (y * width + x) * 4;
          
          // Peso gaussiano: mayor prioridad al centro absoluto
          const weight = Math.exp(-2.0 * distRatio);
          
          const r = data[i];     // Canal rojo
          const g = data[i+1];   // Canal verde
          const b = data[i+2];   // Canal azul
          
          // NUEVO: Criterio más preciso para píxeles válidos
          // (contiene sangre = rojo dominante sobre verde y azul)
          const isValidPixel = 
            r > (g * 1.20) && 
            r > (b * 1.25) &&
            r > 25; // Mínimo valor absoluto
            
          if (isValidPixel) {
            redSum += r * weight;
            greenSum += g * weight;
            blueSum += b * weight;
            count += weight;
            validPixelCount++;
          }
        }
      }
    }
    
    if (count < 1) {
      return { redValue: 0, greenValue: 0, blueValue: 0, quality: 0 };
    }
    
    const avgRed = redSum / count;
    const avgGreen = greenSum / count;
    const avgBlue = blueSum / count;
    
    // Calcular índice de "rojez" como métrica de calidad
    const rednessIndex = avgRed / ((avgGreen + avgBlue) / 2);
    
    // Calcular covertura (qué porcentaje de píxeles es válido)
    const coverageRatio = validPixelCount / pixelCount;
    
    // Calcular calidad general de la región
    const regionQuality = Math.min(1.0, rednessIndex / 1.5) * Math.min(1.0, coverageRatio * 2);
    
    return { 
      redValue: avgRed, 
      greenValue: avgGreen,
      blueValue: avgBlue,
      quality: regionQuality
    };
  }
  
  /**
   * NUEVO: Actualizar proporciones de color rojo para análisis de tendencia
   */
  private updateRedRatio(redValue: number, greenValue: number, blueValue: number): void {
    if (redValue <= 0) return;
    
    const ratio = redValue / (0.5 * greenValue + 0.5 * blueValue);
    this.redRatios.push(ratio);
    
    if (this.redRatios.length > 20) {
      this.redRatios.shift();
    }
    
    // Actualizar umbral adaptativo para el canal rojo
    if (this.redRatios.length >= 10) {
      const sortedRatios = [...this.redRatios].sort((a, b) => a - b);
      const medianIndex = Math.floor(sortedRatios.length / 2);
      const medianRatio = sortedRatios[medianIndex];
      
      // Actualizar umbral suavemente
      if (this.adaptiveRedThreshold === 0) {
        this.adaptiveRedThreshold = medianRatio * 0.8;
      } else {
        this.adaptiveRedThreshold = this.adaptiveRedThreshold * 0.9 + (medianRatio * 0.8) * 0.1;
      }
    }
  }
  
  /**
   * Actualizar componentes AC y DC de la señal para SpO2
   */
  private updateACDCComponents(): void {
    if (this.rawRedValues.length < 10) return;
    
    // NUEVO: Método mejorado para cálculo de componentes AC y DC
    // Usar ventana optimizada para reducir efectos de ruido
    const recentValues = this.rawRedValues.slice(-15);
    
    // Ordenar valores para análisis estadístico
    const sortedValues = [...recentValues].sort((a, b) => a - b);
    
    // DC es aproximadamente el percentil 25 de los valores (más robusto que el mínimo)
    const p25Index = Math.floor(sortedValues.length * 0.25);
    this.dcComponent = sortedValues[p25Index];
    
    // AC es la diferencia entre percentiles altos y bajos (más robusto que max-min)
    const p90Index = Math.floor(sortedValues.length * 0.90);
    const p10Index = Math.floor(sortedValues.length * 0.10);
    this.acComponent = sortedValues[p90Index] - sortedValues[p10Index];
    
    // Calcular índice de perfusión: AC/DC * 100%
    this.perfusionIndex = (this.dcComponent > 0) ? 
      (this.acComponent / this.dcComponent) * 100 : 0;
  }

  /**
   * Analizar señal para detección de dedo y evaluación de calidad
   */
  private analyzeSignal(filtered: number, rawValue: number, roiQuality: number): { isFingerDetected: boolean, quality: number } {
    const currentTime = Date.now();
    const timeSinceLastDetection = currentTime - this.lastDetectionTime;
    
    // NUEVO: Usar umbral adaptativo si está disponible, o el umbral fijo en caso contrario
    const effectiveMinThreshold = this.adaptiveRedThreshold > 0 
      ? this.adaptiveRedThreshold 
      : this.currentConfig.MIN_RED_THRESHOLD;
    
    // Verificar si el valor está dentro del rango válido con histéresis
    const inRange = this.isCurrentlyDetected
      ? rawValue >= (effectiveMinThreshold - this.currentConfig.HYSTERESIS) &&
        rawValue <= (this.currentConfig.MAX_RED_THRESHOLD + this.currentConfig.HYSTERESIS)
      : rawValue >= effectiveMinThreshold &&
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
    if (stability > 0.70) { // Umbral reducido para mayor sensibilidad
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
    const intensityScore = Math.min((rawValue - effectiveMinThreshold) / 
                          (this.currentConfig.MAX_RED_THRESHOLD - effectiveMinThreshold), 1);
    
    // Incorporar índice de perfusión en la evaluación de calidad
    const perfusionScore = Math.min(this.perfusionIndex / 5.0, 1.0);
    
    // NUEVO: Incorporar la calidad de ROI en el cálculo
    const roiScore = Math.min(roiQuality * 1.2, 1.0);
    
    // Calidad ponderada con factores optimizados
    let quality = Math.round(
      (stabilityScore * 0.35 + 
       intensityScore * 0.20 + 
       perfusionScore * 0.20 + 
       roiScore * 0.25) * 100
    );
    
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
    
    // NUEVO: Análisis avanzado de estabilidad con detección de periodicidad
    
    // 1. Estabilidad básica basada en variaciones consecutivas
    const variations = this.lastValues.slice(1).map((val, i) => 
      Math.abs(val - this.lastValues[i])
    );
    
    // Calcular mediana de variaciones (más robusta que la media)
    const sortedVariations = [...variations].sort((a, b) => a - b);
    const medianVariation = sortedVariations[Math.floor(sortedVariations.length / 2)];
    
    // 2. Detección de periodicidad (indicador de señal cardíaca)
    let periodicityScore = 0;
    
    if (this.lastValues.length >= 10) {
      // Buscar picos en la señal
      const peaks = [];
      for (let i = 2; i < this.lastValues.length - 2; i++) {
        if (this.lastValues[i] > this.lastValues[i-1] && 
            this.lastValues[i] > this.lastValues[i-2] && 
            this.lastValues[i] > this.lastValues[i+1] && 
            this.lastValues[i] > this.lastValues[i+2]) {
          peaks.push(i);
        }
      }
      
      // Si hay suficientes picos, analizar intervalos entre ellos
      if (peaks.length >= 2) {
        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
          intervals.push(peaks[i] - peaks[i-1]);
        }
        
        // Calcular variabilidad de intervalos
        const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        const intervalVariability = intervals.reduce((sum, val) => 
          sum + Math.abs(val - avgInterval), 0) / intervals.length;
        
        // Menor variabilidad = mayor periodicidad
        periodicityScore = Math.max(0, Math.min(1, 1 - (intervalVariability / avgInterval)));
      }
    }
    
    // 3. Combinar factores para estabilidad general
    const variationScore = Math.max(0, Math.min(1, 1 - (medianVariation / 10)));
    
    // Estabilidad final (ponderación adaptativa)
    // Dar más peso a periodicidad cuando está presente, o a variación cuando no
    return periodicityScore > 0.5 
      ? (variationScore * 0.4 + periodicityScore * 0.6) 
      : (variationScore * 0.7 + periodicityScore * 0.3);
  }

  /**
   * Detectar región de interés de forma adaptativa
   */
  private detectROI(redValue: number): ProcessedSignal['roi'] {
    // ROI adaptativo basado en la intensidad y calidad de la señal
    const minThreshold = this.adaptiveRedThreshold > 0 
      ? this.adaptiveRedThreshold 
      : this.currentConfig.MIN_RED_THRESHOLD;
    
    const signalStrength = Math.min(1, Math.max(0, (redValue - minThreshold) / 
                                 (this.currentConfig.MAX_RED_THRESHOLD - minThreshold)));
    
    // Factor de calidad para ajustar ROI
    const qualityFactor = Math.min(1, Math.max(0.5, this.lastFrameQuality / 100));
    
    // Tamaño de ROI proporcional a la fuerza de la señal y la calidad
    const baseSize = 50;
    const variableSize = Math.round(signalStrength * qualityFactor * 50);
    const size = baseSize + variableSize;
    
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
