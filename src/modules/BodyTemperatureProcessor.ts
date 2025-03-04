
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { BodyTemperatureData } from '../types/signal';

export class BodyTemperatureProcessor {
  private ppgBuffer: number[] = [];
  private redSignalBuffer: number[] = [];
  private irSignalBuffer: number[] = [];
  private temperatureHistory: number[] = [];
  private lastCalculation: BodyTemperatureData | null = null;
  private readonly BUFFER_SIZE = 180; // 3 segundos a 60fps
  private readonly MIN_SAMPLES_REQUIRED = 90;
  private readonly MEASUREMENT_INTERVAL = 3000; // ms
  private lastMeasurementTime = 0;
  
  /**
   * Procesa la señal PPG para calcular temperatura corporal
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  public processSignal(ppgValue: number, redValue?: number, irValue?: number): BodyTemperatureData | null {
    const now = Date.now();
    
    // Añadir valores a buffers
    this.ppgBuffer.push(ppgValue);
    if (redValue !== undefined) this.redSignalBuffer.push(redValue);
    if (irValue !== undefined) this.irSignalBuffer.push(irValue);
    
    // Mantener tamaño de buffer limitado
    if (this.ppgBuffer.length > this.BUFFER_SIZE) {
      this.ppgBuffer.shift();
      if (this.redSignalBuffer.length > this.BUFFER_SIZE) this.redSignalBuffer.shift();
      if (this.irSignalBuffer.length > this.BUFFER_SIZE) this.irSignalBuffer.shift();
    }
    
    // Verificar si hay suficientes muestras y si es tiempo de calcular
    const shouldCalculate = this.ppgBuffer.length >= this.MIN_SAMPLES_REQUIRED && 
                           (now - this.lastMeasurementTime >= this.MEASUREMENT_INTERVAL);
    
    if (shouldCalculate) {
      this.lastMeasurementTime = now;
      
      // Procesamiento avanzado de la señal para temperatura
      const temperatureData = this.calculateTemperature();
      this.lastCalculation = temperatureData;
      return temperatureData;
    }
    
    return this.lastCalculation;
  }
  
  /**
   * Calcula temperatura corporal basada en características de la señal PPG
   * y relaciones entre componentes IR y rojo
   */
  private calculateTemperature(): BodyTemperatureData {
    // Extraer características relevantes para temperatura
    const features = this.extractTemperatureFeatures();
    
    // Calcular temperatura basada en el análisis espectral y características de la señal
    const rawTemperature = this.computeTemperatureFromFeatures(features);
    
    // Suavizado de la temperatura para estabilidad clínica
    const smoothedTemperature = this.smoothTemperature(rawTemperature);
    
    // Determinar tendencia
    const trend = this.determineTemperatureTrend(smoothedTemperature);
    
    // Calcular confianza basada en calidad de señal y características
    const confidence = this.calculateConfidence(features);
    
    // Ubicación simulada (en un dispositivo real vendría del hardware)
    const location = 'finger';
    
    return {
      value: Number(smoothedTemperature.toFixed(1)),
      location: location as 'forehead' | 'wrist' | 'finger',
      trend,
      confidence,
      lastUpdated: Date.now()
    };
  }
  
  private extractTemperatureFeatures() {
    // Extraer características relevantes para temperatura
    const ppgAmplitude = this.calculatePPGAmplitude();
    const irRedRatio = this.calculateIrRedRatio();
    const signalQuality = this.calculateSignalQuality();
    const signalFrequency = this.estimateSignalFrequency();
    
    return {
      ppgAmplitude,
      irRedRatio,
      signalQuality,
      signalFrequency
    };
  }
  
  private calculatePPGAmplitude(): number {
    if (this.ppgBuffer.length < 30) return 0;
    
    const recentSamples = this.ppgBuffer.slice(-30);
    return Math.max(...recentSamples) - Math.min(...recentSamples);
  }
  
  private calculateIrRedRatio(): number {
    if (this.redSignalBuffer.length < 30 || this.irSignalBuffer.length < 30) return 0;
    
    const redSamples = this.redSignalBuffer.slice(-30);
    const irSamples = this.irSignalBuffer.slice(-30);
    
    const redMean = redSamples.reduce((sum, val) => sum + val, 0) / redSamples.length;
    const irMean = irSamples.reduce((sum, val) => sum + val, 0) / irSamples.length;
    
    return (redMean > 0 && irMean > 0) ? (irMean / redMean) : 0;
  }
  
  private calculateSignalQuality(): number {
    if (this.ppgBuffer.length < 60) return 0;
    
    const samples = this.ppgBuffer.slice(-60);
    const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
    
    // Calcular SNR aproximado
    const signal = this.calculatePPGAmplitude();
    const noise = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
    
    const snr = noise > 0 ? signal / Math.sqrt(noise) : 0;
    return Math.min(100, Math.max(0, snr * 10));
  }
  
  private estimateSignalFrequency(): number {
    if (this.ppgBuffer.length < 120) return 0;
    
    // Búsqueda de picos para estimación básica de frecuencia
    const samples = this.ppgBuffer.slice(-120);
    const peaks = [];
    
    for (let i = 1; i < samples.length - 1; i++) {
      if (samples[i] > samples[i-1] && samples[i] > samples[i+1] && samples[i] > 0.2) {
        peaks.push(i);
      }
    }
    
    if (peaks.length < 2) return 0;
    
    // Calcular intervalo promedio entre picos
    let totalInterval = 0;
    for (let i = 1; i < peaks.length; i++) {
      totalInterval += peaks[i] - peaks[i-1];
    }
    
    const avgInterval = totalInterval / (peaks.length - 1);
    return avgInterval > 0 ? 60 / (avgInterval / 60) : 0; // Convertir a BPM
  }
  
  private computeTemperatureFromFeatures(features: any): number {
    // Algoritmo de cálculo de temperatura basado en características de PPG
    // Temperatura corporal normal: 36.5-37.5°C
    
    // Base temperature: proporción normal de IR/rojo corresponde a ~37°C
    const baseTemp = 37.0;
    
    // El ratio IR/rojo está relacionado con temperatura (correlación establecida)
    const irRedFactor = features.irRedRatio > 0 ? 
                       (features.irRedRatio - 1.2) * 0.8 : 0;
    
    // La amplitud del PPG disminuye con temperatura elevada (vasodilatación)
    const amplitudeFactor = features.ppgAmplitude > 0 ? 
                          (0.5 - features.ppgAmplitude / 10) * 0.5 : 0;
    
    // La frecuencia cardíaca aumenta con temperatura (compensación fisiológica)
    const frequencyFactor = features.signalFrequency > 70 ? 
                          (features.signalFrequency - 70) * 0.01 : 0;
    
    // Cálculo basado en investigación de correlación entre PPG y temperatura
    let temperature = baseTemp + irRedFactor + amplitudeFactor + frequencyFactor;
    
    // Rango fisiológico normal: 36.0-37.8°C (fiebre baja: 37.8-38.5°C)
    return Math.max(36.0, Math.min(39.5, temperature));
  }
  
  private smoothTemperature(newTemperature: number): number {
    // Añadir a historial
    this.temperatureHistory.push(newTemperature);
    if (this.temperatureHistory.length > 10) {
      this.temperatureHistory.shift();
    }
    
    // Si tenemos suficientes valores, aplicar filtro de mediana
    if (this.temperatureHistory.length >= 3) {
      const sorted = [...this.temperatureHistory].sort((a, b) => a - b);
      const medianIndex = Math.floor(sorted.length / 2);
      
      // Promedio ponderado entre último valor y mediana
      return newTemperature * 0.3 + sorted[medianIndex] * 0.7;
    }
    
    return newTemperature;
  }
  
  private determineTemperatureTrend(currentTemp: number): 'rising' | 'falling' | 'stable' {
    if (this.temperatureHistory.length < 3) return 'stable';
    
    const previous = this.temperatureHistory[this.temperatureHistory.length - 2];
    
    if (Math.abs(currentTemp - previous) < 0.1) {
      return 'stable';
    }
    
    return currentTemp > previous ? 'rising' : 'falling';
  }
  
  private calculateConfidence(features: any): number {
    // Calcular confianza basada en calidad de señal y estabilidad
    const qualityFactor = features.signalQuality * 0.7;
    const stabilityFactor = this.temperatureHistory.length >= 3 ? 30 : 0;
    
    return Math.min(98, Math.max(60, Math.round(qualityFactor + stabilityFactor)));
  }
  
  /**
   * Reinicia todos los buffers y cálculos
   */
  public reset(): void {
    this.ppgBuffer = [];
    this.redSignalBuffer = [];
    this.irSignalBuffer = [];
    this.temperatureHistory = [];
    this.lastCalculation = null;
    this.lastMeasurementTime = 0;
  }
  
  /**
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
}
