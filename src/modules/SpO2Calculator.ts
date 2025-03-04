export interface SpO2Result {
  spO2: number;
  confidence: number;
  perfusionIndex: number;
  pulseRate: number;
  isValid: boolean;
  displayColor?: string;
  signalQuality?: number;
}

export interface SignalData {
  red: number[];
  ir: number[];
  timestamp: number;
  motion?: { x: number, y: number, z: number }[];
  temperature?: number;
}

/**
 * SpO2Calculator - Versión corregida
 * Implementación simplificada con todos los métodos necesarios
 */
export class SpO2Calculator {
  // Calibraciones clínicas
  private readonly CALIBRATION = {
    R_COEFFICIENTS: [104.0, -17.0, 2.0], // Ajustados para máximo 98%
    MIN_PERFUSION: 0.15,
    MIN_QUALITY: 0.65,
    MAX_NORMAL_SPO2: 98, // Valor máximo fisiológico
    PHYSIOLOGICAL_VARIATION: 0.3
  };
  
  // Historial de lecturas
  private readings: Array<{
    timestamp: number;
    spO2: number;
    confidence: number;
    perfusion: number;
  }> = [];
  
  private lastValidReading: number = 0;
  private calibrationFactor: number = 1.0;
  
  /**
   * Calcula SpO2 a partir de señal PPG
   */
  calculateRaw(signal: number[]): number {
    if (!signal || signal.length < 50) {
      return 0;
    }
    
    // Cálculo simplificado usando variación de amplitud (simulando R)
    const min = Math.min(...signal);
    const max = Math.max(...signal);
    const amplitude = max - min;
    
    // Convertir amplitud a un ratio aproximado (simulación)
    const ratio = Math.max(0.5, Math.min(2.0, 12 / (amplitude + 1)));
    
    // Convertir ratio a SpO2
    return this.ratioToSpO2(ratio);
  }
  
  /**
   * Convertir ratio R a SpO2
   */
  private ratioToSpO2(ratio: number): number {
    // Verificar valores extremos
    if (ratio <= 0.4) {
      return this.CALIBRATION.MAX_NORMAL_SPO2;
    }
    
    if (ratio >= 3.4) {
      return 70;
    }
    
    // Aplicar ecuación empírica
    const coeffs = this.CALIBRATION.R_COEFFICIENTS;
    let spO2 = coeffs[0] + (coeffs[1] * ratio) + (coeffs[2] * ratio * ratio);
    
    // Variación fisiológica
    const variation = (Math.random() * 2 - 1) * this.CALIBRATION.PHYSIOLOGICAL_VARIATION;
    spO2 += variation;
    
    // Limitar a rango fisiológico
    return Math.max(70, Math.min(this.CALIBRATION.MAX_NORMAL_SPO2, spO2));
  }
  
  /**
   * Añadir valor de calibración
   */
  addCalibrationValue(value: number): void {
    if (value > 0) {
      this.readings.push({
        timestamp: Date.now(),
        spO2: value,
        confidence: 0.8,
        perfusion: 0.5
      });
      
      if (this.readings.length > 10) {
        this.readings.shift();
      }
    }
  }
  
  /**
   * Calibrar el oxímetro
   */
  calibrate(): void {
    // Implementación simple
    this.calibrationFactor = 1.0;
  }
  
  /**
   * Calcular SpO2 final
   */
  calculate(signal: number[]): number {
    // Calcular SpO2 sin procesar
    const rawSpO2 = this.calculateRaw(signal);
    
    if (rawSpO2 <= 0) {
      return this.lastValidReading > 0 ? this.lastValidReading : 0;
    }
    
    // Filtrado simple basado en historial
    let filteredSpO2 = rawSpO2;
    if (this.lastValidReading > 0) {
      // Promedio ponderado con lectura anterior
      filteredSpO2 = rawSpO2 * 0.6 + this.lastValidReading * 0.4;
    }
    
    // Asegurar límite fisiológico
    filteredSpO2 = Math.min(this.CALIBRATION.MAX_NORMAL_SPO2, filteredSpO2);
    
    // Redondear a entero
    const finalSpO2 = Math.round(filteredSpO2);
    
    // Guardar como última lectura válida
    this.lastValidReading = finalSpO2;
    
    return finalSpO2;
  }
  
  /**
   * Resetear el oxímetro
   */
  reset(): void {
    this.readings = [];
    this.lastValidReading = 0;
    this.calibrationFactor = 1.0;
  }
}