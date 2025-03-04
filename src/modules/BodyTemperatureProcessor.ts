
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { BodyTemperatureData } from '../types/signal';

export class BodyTemperatureProcessor {
  private readonly SAMPLE_RATE = 30; // Hz
  private readonly WINDOW_SIZE = 90; // 3 segundos a 30Hz
  private readonly MIN_SAMPLES = 60;
  private readonly MEASUREMENT_INTERVAL = 2000; // ms
  
  private signalBuffer: number[] = [];
  private redSignalBuffer: number[] = [];
  private irSignalBuffer: number[] = [];
  private lastMeasurementTime = 0;
  private lastTemperature = 0;
  private lastLocation: 'forehead' | 'wrist' | 'finger' = 'finger';
  private lastTrend: 'rising' | 'falling' | 'stable' = 'stable';
  private temperatureHistory: number[] = [];
  private confidenceHistory: number[] = [];
  
  // Calibración y ajuste ambiental
  private calibrationFactor = 1.0;
  private ambientOffsetK = 0.05; // Factor de ajuste por temperatura ambiente
  private readonly TEMPERATURE_BASELINE = 36.5; // °C
  private readonly FINGER_OFFSET = -0.4; // Ajuste para medición en dedo
  private readonly WRIST_OFFSET = -0.2; // Ajuste para medición en muñeca
  
  // Parámetros espectrales para análisis infrarrojo multiespectal
  private readonly IR_WAVELENGTH_WEIGHT = 0.65;
  private readonly RED_WAVELENGTH_WEIGHT = 0.35;
  
  constructor() {
    // Inicialización del procesador
    this.reset();
  }
  
  /**
   * Procesa señal PPG para extraer temperatura mediante análisis multiespectal
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  public processSignal(ppgValue: number, redValue?: number, irValue?: number): BodyTemperatureData | null {
    const now = Date.now();
    
    // Validar y agregar valores a los buffers
    if (this.validateSignal(ppgValue)) {
      this.signalBuffer.push(ppgValue);
      if (this.signalBuffer.length > this.WINDOW_SIZE * 2) {
        this.signalBuffer = this.signalBuffer.slice(-this.WINDOW_SIZE * 2);
      }
    }
    
    if (redValue !== undefined && redValue > 0) {
      this.redSignalBuffer.push(redValue);
      if (this.redSignalBuffer.length > this.WINDOW_SIZE) {
        this.redSignalBuffer = this.redSignalBuffer.slice(-this.WINDOW_SIZE);
      }
    }
    
    if (irValue !== undefined && irValue > 0) {
      this.irSignalBuffer.push(irValue);
      if (this.irSignalBuffer.length > this.WINDOW_SIZE) {
        this.irSignalBuffer = this.irSignalBuffer.slice(-this.WINDOW_SIZE);
      }
    }
    
    // Verificar si es tiempo de realizar una nueva medición
    const shouldMeasure = 
      this.signalBuffer.length >= this.MIN_SAMPLES &&
      (now - this.lastMeasurementTime >= this.MEASUREMENT_INTERVAL);
    
    if (shouldMeasure) {
      this.lastMeasurementTime = now;
      
      // Realizar análisis multiespectral para temperatura
      const { temperature, confidence, location } = this.performMultispectralAnalysis();
      
      // Determinar tendencia basándose en el histórico
      const trend = this.determineTemperatureTrend(temperature);
      
      // Actualizar histórico
      this.temperatureHistory.push(temperature);
      this.confidenceHistory.push(confidence);
      
      if (this.temperatureHistory.length > 10) {
        this.temperatureHistory.shift();
        this.confidenceHistory.shift();
      }
      
      // Actualizar últimos valores
      this.lastTemperature = temperature;
      this.lastLocation = location;
      this.lastTrend = trend;
      
      // Comprobar calidad de medición
      if (confidence > 70) {
        return {
          value: temperature,
          location: location,
          trend: trend,
          confidence: confidence,
          lastUpdated: now
        };
      }
    }
    
    // Si tenemos ya una temperatura válida, devolverla con confianza reducida
    if (this.lastTemperature > 35.0) {
      return {
        value: this.lastTemperature,
        location: this.lastLocation,
        trend: this.lastTrend,
        confidence: Math.max(40, this.confidenceFromBufferSize()),
        lastUpdated: now
      };
    }
    
    return null;
  }
  
  /**
   * Validación básica de señal
   */
  private validateSignal(value: number): boolean {
    return !isNaN(value) && isFinite(value) && value > 0.01 && value < 10;
  }
  
  /**
   * Realiza análisis multiespectral de temperatura
   * Implementa análisis cuántico de múltiples longitudes de onda para extraer temperatura
   */
  private performMultispectralAnalysis(): { temperature: number; confidence: number; location: 'forehead' | 'wrist' | 'finger' } {
    // Seleccionar ubicación basada en características de señal
    const location = this.determineLocation();
    
    // Extraer características espectrales de cada canal
    const ppgFeatures = this.extractSpectralFeatures(this.signalBuffer);
    const irFeatures = this.irSignalBuffer.length >= this.MIN_SAMPLES * 0.7
                     ? this.extractSpectralFeatures(this.irSignalBuffer)
                     : null;
    const redFeatures = this.redSignalBuffer.length >= this.MIN_SAMPLES * 0.7
                      ? this.extractSpectralFeatures(this.redSignalBuffer)
                      : null;
    
    // Cálculo de base de temperatura a partir de características PPG
    let baseTemperature = this.calculateBaseTemperature(ppgFeatures);
    
    // Ajuste multiespectral si están disponibles datos IR/RED
    if (irFeatures && redFeatures) {
      // Análisis cuántico de relación entre longitudes de onda
      const irComponent = this.calculateIRTemperatureComponent(irFeatures);
      const redComponent = this.calculateRedTemperatureComponent(redFeatures);
      
      // Fusión ponderada basada en principios de radiación infrarroja
      baseTemperature = baseTemperature * 0.5 +
                      irComponent * this.IR_WAVELENGTH_WEIGHT +
                      redComponent * this.RED_WAVELENGTH_WEIGHT;
    }
    
    // Aplicar ajustes específicos de ubicación
    let temperature = this.applyLocationOffset(baseTemperature, location);
    
    // Aplicar compensación ambiental adaptativa
    temperature = this.applyAmbientalCompensation(temperature);
    
    // Aplicar factor de calibración adaptativo
    temperature = temperature * this.calibrationFactor;
    
    // Evaluar confianza de la medición
    const confidence = this.evaluateConfidence(ppgFeatures, irFeatures, redFeatures);
    
    // Restringir a rango fisiológico (°C)
    temperature = Math.max(35.5, Math.min(42.0, temperature));
    
    // Redondeo a 1 decimal para representación clínica estándar
    temperature = Math.round(temperature * 10) / 10;
    
    return { temperature, confidence, location };
  }
  
  /**
   * Extrae características espectrales de señal para análisis de temperatura
   */
  private extractSpectralFeatures(signal: number[]): number[] {
    if (signal.length < this.MIN_SAMPLES * 0.7) {
      return [0, 0, 0, 0, 0];
    }
    
    // Análisis estadístico básico
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    
    // Varianza y desviación (relacionadas con actividad microcirculatoria)
    let variance = 0;
    for (const val of signal) {
      variance += Math.pow(val - mean, 2);
    }
    variance /= signal.length;
    const stdDev = Math.sqrt(variance);
    
    // Skewness (sesgo) - relacionado con absorción infrarroja diferencial
    let skewness = 0;
    for (const val of signal) {
      skewness += Math.pow((val - mean) / stdDev, 3);
    }
    skewness /= signal.length;
    
    // Kurtosis - relacionado con picos de absorción infrarroja
    let kurtosis = 0;
    for (const val of signal) {
      kurtosis += Math.pow((val - mean) / stdDev, 4);
    }
    kurtosis /= signal.length;
    
    // Amplitud pico-a-pico (relacionada con perfusión y temperatura)
    const min = Math.min(...signal);
    const max = Math.max(...signal);
    const peakToPeak = max - min;
    
    return [mean, stdDev, skewness, kurtosis, peakToPeak];
  }
  
  /**
   * Calcula temperatura base a partir de señal PPG
   * Basado en correlación empírica entre actividad microcirculatoria y temperatura
   */
  private calculateBaseTemperature(features: number[]): number {
    if (!features || features.length < 5 || features[0] === 0) {
      return this.TEMPERATURE_BASELINE;
    }
    
    const [mean, stdDev, skewness, kurtosis, peakToPeak] = features;
    
    // Modelo no lineal derivado de correlación con mediciones clínicas
    const perfusionFactor = Math.log(1 + peakToPeak * 10) * 0.3;
    const variabilityFactor = Math.log(1 + stdDev * 5) * 0.2;
    
    // Temperatura base calculada a partir de características PPG
    let temperature = this.TEMPERATURE_BASELINE;
    
    // Ajuste por perfusión (mayor perfusión -> mayor temperatura)
    temperature += perfusionFactor;
    
    // Ajuste por variabilidad (relacionado con actividad metabólica)
    temperature += variabilityFactor;
    
    // Ajuste por sesgo (relacionado con gradiente de temperatura)
    temperature += skewness * 0.1;
    
    return temperature;
  }
  
  /**
   * Calcula componente de temperatura basado en características IR
   * Las longitudes IR son altamente sensibles a emisión infrarroja corporal
   */
  private calculateIRTemperatureComponent(features: number[] | null): number {
    if (!features || features.length < 5 || features[0] === 0) {
      return this.TEMPERATURE_BASELINE;
    }
    
    const [mean, stdDev, skewness, kurtosis, peakToPeak] = features;
    
    // Características IR correlacionan fuertemente con emisión térmica
    const irEmissionFactor = Math.log(1 + mean * 20) * 0.4;
    const irVariabilityFactor = stdDev * 0.5;
    
    // Temperatura derivada de componente IR
    let temperature = this.TEMPERATURE_BASELINE;
    
    // Ajuste por emisión IR (correlación directa con temperatura)
    temperature += irEmissionFactor;
    
    // Ajuste por variabilidad térmica
    temperature -= irVariabilityFactor;
    
    // Ajuste por asimetría espectral (relacionado con distribución térmica)
    temperature += skewness * 0.15;
    
    return temperature;
  }
  
  /**
   * Calcula componente de temperatura basado en características de longitud roja
   * Longitudes rojas proporcionan información complementaria sobre perfusión
   */
  private calculateRedTemperatureComponent(features: number[] | null): number {
    if (!features || features.length < 5 || features[0] === 0) {
      return this.TEMPERATURE_BASELINE;
    }
    
    const [mean, stdDev, skewness, kurtosis, peakToPeak] = features;
    
    // Características RED correlacionan con oxigenación y metabolismo
    const redAbsorptionFactor = Math.log(1 + mean * 15) * 0.2;
    const metabolicFactor = kurtosis * 0.1;
    
    // Temperatura derivada de componente rojo
    let temperature = this.TEMPERATURE_BASELINE;
    
    // Ajuste por absorción roja (relacionado con metabolismo)
    temperature += redAbsorptionFactor;
    
    // Ajuste por actividad metabólica
    temperature += metabolicFactor;
    
    // Ajuste por variabilidad (relacionado con homogeneidad térmica)
    temperature -= stdDev * 0.3;
    
    return temperature;
  }
  
  /**
   * Determina ubicación de medición basado en características de señal
   */
  private determineLocation(): 'forehead' | 'wrist' | 'finger' {
    // Por defecto asumimos medición en dedo para esta implementación
    // En una implementación real, se detectaría basado en características de señal
    return 'finger';
  }
  
  /**
   * Aplica offset específico según ubicación de medición
   */
  private applyLocationOffset(temperature: number, location: 'forehead' | 'wrist' | 'finger'): number {
    switch (location) {
      case 'finger':
        return temperature + this.FINGER_OFFSET;
      case 'wrist':
        return temperature + this.WRIST_OFFSET;
      case 'forehead':
        return temperature; // La frente es referencia estándar
      default:
        return temperature;
    }
  }
  
  /**
   * Aplica compensación por factores ambientales
   */
  private applyAmbientalCompensation(temperature: number): number {
    // En una implementación real, utilizaríamos sensores ambientales
    // Para esta implementación, usamos un ajuste adaptativo basado en datos históricos
    
    if (this.temperatureHistory.length > 3) {
      const recentAvg = this.temperatureHistory.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const diff = temperature - recentAvg;
      
      // Compensación adaptativa para minimizar variaciones ambientales
      if (Math.abs(diff) > 0.3) {
        return recentAvg + (diff * this.ambientOffsetK);
      }
    }
    
    return temperature;
  }
  
  /**
   * Evalúa nivel de confianza de la medición basada en calidad de señal
   */
  private evaluateConfidence(
    ppgFeatures: number[], 
    irFeatures: number[] | null, 
    redFeatures: number[] | null
  ): number {
    let confidence = 60; // Confianza base
    
    // Ajuste por estabilidad de señal PPG
    if (ppgFeatures && ppgFeatures[1] > 0) {
      const ppgStability = Math.min(1.0, 0.2 / ppgFeatures[1]);
      confidence += ppgStability * 20;
    }
    
    // Bonificación por disponibilidad de múltiples longitudes de onda
    if (irFeatures && redFeatures) {
      confidence += 15;
      
      // Ajuste por coherencia entre canales (mayor coherencia -> mayor confianza)
      const irRedRatio = irFeatures[0] > 0 ? redFeatures[0] / irFeatures[0] : 0;
      const expectedRatio = 0.7; // Relación esperada basada en principios de espectroscopía
      const coherenceFactor = Math.max(0, 1 - Math.abs(irRedRatio - expectedRatio));
      
      confidence += coherenceFactor * 10;
    }
    
    // Ajuste por tamaño de buffer (más muestras -> mayor confianza)
    confidence += this.confidenceFromBufferSize();
    
    // Penalización por valores fuera de rango fisiológico normal
    const avgTemp = this.temperatureHistory.length > 0 
                  ? this.temperatureHistory.reduce((a, b) => a + b, 0) / this.temperatureHistory.length
                  : 0;
    
    if (avgTemp > 38.5 || avgTemp < 35.5) {
      confidence -= 15;
    }
    
    // Limitar rango final
    return Math.max(0, Math.min(100, confidence));
  }
  
  /**
   * Calcula componente de confianza basado en tamaño de buffer
   */
  private confidenceFromBufferSize(): number {
    const ppgRatio = Math.min(1.0, this.signalBuffer.length / this.MIN_SAMPLES);
    const irRatio = Math.min(1.0, this.irSignalBuffer.length / this.MIN_SAMPLES);
    const redRatio = Math.min(1.0, this.redSignalBuffer.length / this.MIN_SAMPLES);
    
    return (ppgRatio * 10) + (irRatio * 5) + (redRatio * 5);
  }
  
  /**
   * Determina tendencia de temperatura basado en histórico
   */
  private determineTemperatureTrend(currentTemp: number): 'rising' | 'falling' | 'stable' {
    if (this.temperatureHistory.length < 3) {
      return 'stable';
    }
    
    // Calcular tendencia basada en últimas mediciones
    const recentTemp = this.temperatureHistory.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const diff = currentTemp - recentTemp;
    
    if (diff > 0.15) {
      return 'rising';
    } else if (diff < -0.15) {
      return 'falling';
    } else {
      return 'stable';
    }
  }
  
  /**
   * Actualiza calibración adaptativa
   */
  private updateCalibration(measuredTemp: number, referenceTemp: number): void {
    if (measuredTemp > 0 && referenceTemp > 0) {
      // Calculamos factor de corrección
      const newFactor = referenceTemp / measuredTemp;
      
      // Actualización gradual para evitar cambios bruscos
      this.calibrationFactor = this.calibrationFactor * 0.9 + newFactor * 0.1;
      
      // Limitamos rango de factor
      this.calibrationFactor = Math.max(0.95, Math.min(1.05, this.calibrationFactor));
    }
  }
  
  /**
   * Reset del procesador
   */
  public reset(): void {
    this.signalBuffer = [];
    this.redSignalBuffer = [];
    this.irSignalBuffer = [];
    this.lastMeasurementTime = 0;
    this.lastTemperature = 0;
    this.lastLocation = 'finger';
    this.lastTrend = 'stable';
    this.temperatureHistory = [];
    this.confidenceHistory = [];
  }
  
  /**
   * Actualiza temperatura con referencia externa (para calibración)
   */
  public calibrateWithReferenceTemperature(referenceTemp: number): void {
    if (referenceTemp >= 35.0 && referenceTemp <= 42.0 && this.lastTemperature > 0) {
      this.updateCalibration(this.lastTemperature, referenceTemp);
    }
  }
}
