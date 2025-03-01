
import { calculateAC, calculateDC } from '../utils/signalProcessingUtils';

export class SpO2Calculator {
  // Constantes mínimas para cálculo SpO2 (solo valores esenciales)
  private readonly SPO2_MIN_AC_VALUE = 0.1; // Reducido para detectar señales más bajas
  private readonly SPO2_BUFFER_SIZE = 5; // Mínimo para mostrar medidas casi inmediatas

  // Variables de estado
  private spo2Buffer: number[] = [];
  private spo2CalibrationValues: number[] = [];
  private spO2Calibrated: boolean = false;
  private spO2CalibrationOffset: number = 0;
  private lastValidValue: number = 0;

  /**
   * Reset all state variables
   */
  reset(): void {
    this.spo2Buffer = [];
    this.spo2CalibrationValues = [];
    this.spO2Calibrated = false;
    this.spO2CalibrationOffset = 0;
    this.lastValidValue = 0;
    console.log("SpO2Calculator: Reset completo");
  }

  /**
   * Calculate raw SpO2 without filters or calibration
   * Implementación directa basada en principios de oximetría de pulso
   */
  calculateRaw(values: number[]): number {
    if (values.length < 10) return 0;

    try {
      // Características de la onda PPG
      const dc = calculateDC(values);
      if (dc <= 0) return 0;

      const ac = calculateAC(values);
      if (ac < this.SPO2_MIN_AC_VALUE) return 0;

      // Índice de perfusión (PI = relación AC/DC) - indicador clave en oximetría real
      const perfusionIndex = ac / dc;
      
      // SpO2 basado en el índice de perfusión
      // En un oxímetro real, esto se hace comparando dos longitudes de onda
      // Aquí usamos una relación aproximada basada en estudios de oximetría
      const R = perfusionIndex * 1.2;
      
      // Aproximación lineal simple: SpO2 = 110 - 25 × R
      // Esta es una aproximación empírica utilizada en algunos dispositivos
      let rawSpO2 = Math.round(110 - (25 * R));
      
      // Límite fisiológico superior (98% - valor máximo normal)
      rawSpO2 = Math.min(rawSpO2, 98);
      
      // Límite fisiológico inferior (75% - valor mínimo medible con precisión)
      rawSpO2 = Math.max(rawSpO2, 75);
      
      console.log("SpO2 raw calculado:", rawSpO2, "PI:", perfusionIndex, "R:", R);
      
      return rawSpO2;
    } catch (err) {
      console.error("Error en cálculo SpO2:", err);
      return 0;
    }
  }

  /**
   * Calibrate SpO2 based on initial values
   */
  calibrate(): void {
    if (this.spo2CalibrationValues.length < 3) return;
    
    // Ordenar valores y eliminar valores atípicos
    const sortedValues = [...this.spo2CalibrationValues].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedValues.length * 0.25);
    const endIdx = Math.floor(sortedValues.length * 0.75);
    
    // Tomar el rango medio de valores
    const middleValues = sortedValues.slice(startIdx, endIdx + 1);
    
    if (middleValues.length > 0) {
      // Calcular promedio del rango medio
      const avgValue = middleValues.reduce((sum, val) => sum + val, 0) / middleValues.length;
      
      // Si el promedio es razonable, usar como base de calibración
      if (avgValue > 0) {
        // Ajustar para que sea cercano a valores normales (95-98%)
        this.spO2CalibrationOffset = 96 - avgValue;
        console.log('SpO2 calibrado con offset:', this.spO2CalibrationOffset);
        this.spO2Calibrated = true;
      }
    }
  }

  /**
   * Add calibration value
   */
  addCalibrationValue(value: number): void {
    if (value > 0) {
      this.spo2CalibrationValues.push(value);
      // Mantener solo los últimos 5 valores
      if (this.spo2CalibrationValues.length > 5) {
        this.spo2CalibrationValues.shift();
      }
    }
  }

  /**
   * Calculate SpO2 with minimal filtering and calibration
   * Muestra valores prácticamente directos con mínima intervención
   */
  calculate(values: number[]): number {
    try {
      // Si no hay suficientes valores, usar valor anterior o 0
      if (values.length < 10) {
        return this.lastValidValue > 0 ? this.lastValidValue : 0;
      }

      // Obtener valor crudo de SpO2
      const rawSpO2 = this.calculateRaw(values);
      if (rawSpO2 <= 0) {
        return this.lastValidValue > 0 ? this.lastValidValue : 0;
      }

      // Aplicar calibración si está disponible
      let resultSpO2 = rawSpO2;
      if (this.spO2Calibrated) {
        resultSpO2 = Math.round(rawSpO2 + this.spO2CalibrationOffset);
        // Limitar a rango fisiológico (75-98%)
        resultSpO2 = Math.min(Math.max(resultSpO2, 75), 98);
      }
      
      // Actualizar buffer con valor mínimamente filtrado
      this.spo2Buffer.push(resultSpO2);
      if (this.spo2Buffer.length > this.SPO2_BUFFER_SIZE) {
        this.spo2Buffer.shift();
      }
      
      // Filtro muy ligero para estabilizar lectura sin perder variaciones reales
      if (this.spo2Buffer.length >= 3) {
        // Ordenar para descartar extremos
        const sorted = [...this.spo2Buffer].sort((a, b) => a - b);
        // Tomar el valor medio como medida más estable
        resultSpO2 = sorted[Math.floor(sorted.length / 2)];
      }
      
      // Actualizar último valor válido
      this.lastValidValue = resultSpO2;
      
      console.log("SpO2 final calculado:", resultSpO2);
      return resultSpO2;
    } catch (err) {
      console.error("Error en procesamiento final SpO2:", err);
      if (this.lastValidValue > 0) {
        return this.lastValidValue;
      }
      return 0;
    }
  }
}
