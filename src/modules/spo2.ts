export class SpO2Calculator {
  // Constantes mejoradas basadas en estudios clínicos recientes
  private readonly SPO2_DEFAULT_OFFSET = 0.8;
  private readonly SPO2_CALIBRATION_WINDOW = 5;
  private readonly SPO2_MAX_VALUE = 100;
  private readonly SPO2_MIN_VALUE = 70;
  private readonly SPO2_NORMAL_VALUE = 97;

  // Nuevos parámetros para el algoritmo RoR
  private readonly PPG_FRAMES_PER_WINDOW = 60;
  private readonly MIN_PEAKS_FOR_ROR = 4;
  private readonly PERFUSION_INDEX_THRESHOLD = 0.3;

  // Estado y calibración
  private calibrationValues: number[] = [];
  private qualityWeights: number[] = [];
  private calibrationOffset: number = this.SPO2_DEFAULT_OFFSET;
  private lastRawValue: number = 0;
  private calibrationFactor: number = 1.0;
  
  // Variables para algoritmo RoR
  private acValues: number[] = [];  // Componente AC de la señal PPG
  private dcValues: number[] = [];  // Componente DC de la señal PPG

  constructor() {
    this.reset();
  }

  /**
   * Resetear el calculador
   */
  reset(): void {
    this.calibrationValues = [];
    this.qualityWeights = [];
    this.lastRawValue = 0;
    this.calibrationOffset = this.SPO2_DEFAULT_OFFSET;
    this.calibrationFactor = 1.0;
    this.acValues = [];
    this.dcValues = [];
  }

  /**
   * Método actualizado para calcular SpO2 usando el algoritmo RoR avanzado
   * @param values - Array de valores PPG para análisis
   */
  calculate(values: number[]): number {
    // Verificar suficientes datos para el cálculo
    if (!values || values.length < this.PPG_FRAMES_PER_WINDOW) {
      return 0;
    }

    try {
      // 1. Extraer características clave de la señal PPG
      const { ac, dc, peaks, valleys, perfusionIndex } = this.extractPPGFeatures(values);
      
      // Acumular datos para el cálculo RoR
      this.acValues.push(ac);
      this.dcValues.push(dc);
      
      // Mantener tamaño buffer
      if (this.acValues.length > this.SPO2_CALIBRATION_WINDOW) {
        this.acValues.shift();
        this.dcValues.shift();
      }
      
      // Necesitamos suficientes muestras para un cálculo preciso
      if (this.acValues.length < 3 || peaks.length < this.MIN_PEAKS_FOR_ROR) {
        // Si tenemos valor previo, retornarlo hasta tener suficientes datos
        return this.lastRawValue > 0 ? this.lastRawValue : 0;
      }

      // Verificar calidad de la señal mediante índice de perfusión
      if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD) {
        console.log("SpO2Calculator: Señal débil, índice de perfusión bajo:", perfusionIndex);
        return this.lastRawValue > 0 ? this.lastRawValue : 0;
      }

      // 2. Calcular el Ratio of Ratios (RoR)
      const averageAC = this.acValues.reduce((sum, val) => sum + val, 0) / this.acValues.length;
      const averageDC = this.dcValues.reduce((sum, val) => sum + val, 0) / this.dcValues.length;
      
      // Evitar división por cero
      if (averageDC === 0) return this.lastRawValue > 0 ? this.lastRawValue : 0;
      
      const ror = averageAC / averageDC;
      
      // 3. Aplicar ecuación clínica para SpO2
      // Basada en la ecuación de Severinghaus modificada
      // SpO2 = 110 - 25 * RoR (con ajustes de calibración)
      const rawSpO2 = 110 - (25 * ror * this.calibrationFactor);
      
      // 4. Aplicar restricciones fisiológicas y calibración
      const adjustedSpO2 = this.applyCalibration(rawSpO2);
      
      // 5. Limitar a rango válido y redondear
      const finalSpO2 = Math.max(
        this.SPO2_MIN_VALUE, 
        Math.min(Math.round(adjustedSpO2), this.SPO2_MAX_VALUE)
      );
      
      // Almacenar valor para referencia
      this.lastRawValue = finalSpO2;
      
      console.log("SpO2Calculator: Nueva medición", {
        ror,
        rawSpO2,
        adjustedSpO2,
        finalSpO2,
        peaks: peaks.length,
        perfusionIndex,
        calibrationFactor: this.calibrationFactor
      });
      
      return finalSpO2;
    } catch (error) {
      console.error("Error en cálculo de SpO2:", error);
      return this.lastRawValue > 0 ? this.lastRawValue : 0;
    }
  }

  /**
   * Método auxiliar para calcular SpO2 sin calibración para diagnóstico
   */
  calculateRaw(values: number[]): number {
    if (!values || values.length < this.PPG_FRAMES_PER_WINDOW) {
      return 0;
    }

    try {
      const { ac, dc, perfusionIndex } = this.extractPPGFeatures(values);
      
      if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD) {
        return 0;
      }
      
      // Evitar división por cero
      if (dc === 0) return 0;
      
      const ror = ac / dc;
      const rawSpO2 = 110 - (25 * ror);
      
      return Math.max(
        this.SPO2_MIN_VALUE, 
        Math.min(Math.round(rawSpO2), this.SPO2_MAX_VALUE)
      );
    } catch (error) {
      console.error("Error en cálculo raw de SpO2:", error);
      return 0;
    }
  }

  /**
   * Método para añadir un valor de calibración con su peso de calidad
   */
  addCalibrationValue(value: number, quality: number = 1.0): void {
    if (value < this.SPO2_MIN_VALUE || value > this.SPO2_MAX_VALUE) {
      return;
    }
    
    this.calibrationValues.push(value);
    this.qualityWeights.push(Math.max(0.1, Math.min(1.0, quality)));
    
    // Limitar tamaño del historial de calibración
    if (this.calibrationValues.length > this.SPO2_CALIBRATION_WINDOW) {
      this.calibrationValues.shift();
      this.qualityWeights.shift();
    }
  }

  /**
   * Actualiza el factor de calibración basado en el offset proporcionado
   */
  updateCalibrationFactor(offset: number): void {
    // Aplicar ajuste gradual al factor de calibración
    const newFactor = 1.0 + (offset / 100);
    
    // Cambio gradual para evitar saltos bruscos
    this.calibrationFactor = this.calibrationFactor * 0.7 + newFactor * 0.3;
    
    // Limitar el factor de calibración a un rango razonable
    this.calibrationFactor = Math.max(0.85, Math.min(1.15, this.calibrationFactor));
    
    console.log("SpO2Calculator: Factor de calibración actualizado:", this.calibrationFactor);
  }

  /**
   * Ejecutar calibración basada en valores acumulados
   */
  calibrate(): void {
    if (this.calibrationValues.length < 3) {
      return;
    }
    
    // Calcular promedio ponderado por calidad
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < this.calibrationValues.length; i++) {
      weightedSum += this.calibrationValues[i] * this.qualityWeights[i];
      totalWeight += this.qualityWeights[i];
    }
    
    if (totalWeight === 0) {
      return;
    }
    
    const weightedAverage = weightedSum / totalWeight;
    
    // Ajustar offset basado en la desviación del valor normal
    // (diferencia entre el promedio medido y el valor normal esperado)
    const deviation = this.SPO2_NORMAL_VALUE - weightedAverage;
    
    // Ajuste gradual del offset
    this.calibrationOffset = this.calibrationOffset * 0.8 + (this.SPO2_DEFAULT_OFFSET + deviation * 0.1) * 0.2;
    
    // Limitar el offset a un rango razonable
    this.calibrationOffset = Math.max(-2, Math.min(2, this.calibrationOffset));
    
    console.log("SpO2Calculator: Calibración completada", {
      weightedAverage,
      deviation,
      newOffset: this.calibrationOffset
    });
  }

  /**
   * Extrae características críticas de la señal PPG para el cálculo de SpO2
   */
  private extractPPGFeatures(values: number[]): {
    ac: number;
    dc: number;
    peaks: number[];
    valleys: number[];
    perfusionIndex: number;
  } {
    // Encuentra picos y valles
    const peaks: number[] = [];
    const valleys: number[] = [];
    
    // Usar ventana deslizante para detectar picos locales
    for (let i = 2; i < values.length - 2; i++) {
      if (values[i] > values[i-1] && values[i] > values[i-2] &&
          values[i] > values[i+1] && values[i] > values[i+2]) {
        peaks.push(i);
      }
      
      if (values[i] < values[i-1] && values[i] < values[i-2] &&
          values[i] < values[i+1] && values[i] < values[i+2]) {
        valleys.push(i);
      }
    }
    
    // Calcular componentes AC y DC
    let maxValue = -Infinity;
    let minValue = Infinity;
    
    for (const value of values) {
      if (value > maxValue) maxValue = value;
      if (value < minValue) minValue = value;
    }
    
    // Evitar divisiones por cero o valores negativos
    if (maxValue <= minValue) {
      maxValue = minValue + 1;
    }
    
    // Componente DC es el valor medio o línea base
    const dc = minValue + (maxValue - minValue) * 0.35;
    
    // Componente AC es la amplitud pico a pico
    const ac = maxValue - minValue;
    
    // Índice de perfusión (PI = AC/DC * 100%)
    const perfusionIndex = dc !== 0 ? (ac / dc) : 0;
    
    return { ac, dc, peaks, valleys, perfusionIndex };
  }

  /**
   * Aplica ajustes de calibración al valor crudo de SpO2
   */
  private applyCalibration(rawSpO2: number): number {
    // Aplicar offset de calibración
    const calibratedSpO2 = rawSpO2 + this.calibrationOffset;
    
    // Evitar valores no fisiológicos
    return Math.max(this.SPO2_MIN_VALUE, Math.min(calibratedSpO2, this.SPO2_MAX_VALUE));
  }
} 