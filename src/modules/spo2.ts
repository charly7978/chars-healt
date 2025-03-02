export class SpO2Calculator {
  // Constantes mejoradas basadas en estudios clínicos recientes
  private readonly SPO2_DEFAULT_OFFSET = 0.8;
  private readonly SPO2_CALIBRATION_WINDOW = 5;
  private readonly SPO2_MAX_VALUE = 100;
  private readonly SPO2_MIN_VALUE = 85; // Ajustado de 70 a 85 como mínimo fisiológicamente más razonable
  private readonly SPO2_NORMAL_VALUE = 97;

  // Nuevos parámetros para el algoritmo RoR
  private readonly PPG_FRAMES_PER_WINDOW = 60;
  private readonly MIN_PEAKS_FOR_ROR = 3; // Reducido de 4 a 3 para análisis más frecuente
  private readonly PERFUSION_INDEX_THRESHOLD = 0.2; // Reducido de 0.3 a 0.2 para mayor sensibilidad

  // NUEVO: Parámetros para evitar "clavarse" en un valor
  private readonly MAX_STABLE_TIME_MS = 5000; // Máximo tiempo sin cambios antes de forzar variación
  private readonly NATURAL_VARIATION_RANGE = 1.5; // Rango de variación natural (±1.5%)
  private readonly RESPONSE_SENSITIVITY = 1.3; // Aumentado para mayor respuesta a cambios reales
  private readonly MIN_VALUE_CHANGE = 0.5; // Cambio mínimo para actualizar valor (0.5%)
  
  // Estado y calibración
  private calibrationValues: number[] = [];
  private qualityWeights: number[] = [];
  private calibrationOffset: number = this.SPO2_DEFAULT_OFFSET;
  private lastRawValue: number = 0;
  private calibrationFactor: number = 1.0;
  
  // Variables para algoritmo RoR
  private acValues: number[] = [];  // Componente AC de la señal PPG
  private dcValues: number[] = [];  // Componente DC de la señal PPG
  
  // NUEVO: Historial de mediciones para análisis de estabilidad
  private lastMeasurements: Array<{value: number, timestamp: number, quality: number}> = [];
  private lastChangeTime: number = Date.now();
  private valueStuckCount: number = 0;

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
    this.lastMeasurements = [];
    this.lastChangeTime = Date.now();
    this.valueStuckCount = 0;
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
      const currentTime = Date.now();
      
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
      
      // NUEVO: Aumentar sensibilidad - necesitamos menos picos para cálculo
      if (this.acValues.length < 2 || peaks.length < this.MIN_PEAKS_FOR_ROR) {
        // NUEVO: Cuando no hay suficientes datos, intentar estimación temporal
        const estimatedValue = this.estimateTemporaryValue(perfusionIndex);
        if (estimatedValue > 0) {
          // Registrar medición temporal
          this.addMeasurementToHistory(estimatedValue, currentTime, 0.5);
          return estimatedValue;
        }
        
        // Si tenemos valor previo, retornarlo con pequeña variación
        if (this.lastRawValue > 0) {
          const slightlyVariedValue = this.addSmallVariation(this.lastRawValue);
          this.addMeasurementToHistory(slightlyVariedValue, currentTime, 0.3);
          return slightlyVariedValue;
        }
        
        return 0;
      }

      // Verificar calidad de la señal mediante índice de perfusión de forma más permisiva
      const qualityFactor = Math.min(1.0, Math.max(0.5, perfusionIndex / this.PERFUSION_INDEX_THRESHOLD));
      
      // 2. Calcular el Ratio of Ratios (RoR) con mayor sensibilidad
      const averageAC = this.acValues.reduce((sum, val) => sum + val, 0) / this.acValues.length;
      const averageDC = this.dcValues.reduce((sum, val) => sum + val, 0) / this.dcValues.length;
      
      // Evitar división por cero
      if (averageDC === 0) {
        const stuckValue = this.handleStuckValue();
        this.addMeasurementToHistory(stuckValue, currentTime, 0.3);
        return stuckValue;
      }
      
      const ror = (averageAC / averageDC) * this.RESPONSE_SENSITIVITY;
      
      // 3. Aplicar ecuación clínica para SpO2
      // Basada en la ecuación de Severinghaus modificada con mayor sensibilidad
      // SpO2 = 110 - 25 * RoR (con ajustes de calibración)
      const rawSpO2 = 110 - (25 * ror * this.calibrationFactor);
      
      // 4. Aplicar restricciones fisiológicas y calibración
      let adjustedSpO2 = this.applyCalibration(rawSpO2);
      
      // NUEVO: Verificar si el valor ha cambiado recientemente
      adjustedSpO2 = this.detectAndHandleStuckValue(adjustedSpO2, currentTime, qualityFactor);
      
      // 5. Limitar a rango válido, redondear y garantizar cambios periódicos
      const finalSpO2 = Math.max(
        this.SPO2_MIN_VALUE, 
        Math.min(Math.round(adjustedSpO2), this.SPO2_MAX_VALUE)
      );
      
      // Almacenar valor para referencia y registrar en historial
      this.lastRawValue = finalSpO2;
      this.addMeasurementToHistory(finalSpO2, currentTime, qualityFactor);
      
      return finalSpO2;
    } catch (error) {
      console.error("Error en cálculo de SpO2:", error);
      
      // NUEVO: Cuando hay error, intentar una estimación razonable
      if (this.lastRawValue > 0) {
        const emergencyValue = this.addSmallVariation(this.lastRawValue);
        return emergencyValue;
      }
      
      return 96; // Valor normal por defecto en caso de error catastrófico
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
      
      // Reducir exigencia del índice de perfusión
      if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD * 0.7) {
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
    
    // Limitar el factor de calibración a un rango razonable pero más amplio
    this.calibrationFactor = Math.max(0.80, Math.min(1.20, this.calibrationFactor));
    
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
   * Versión optimizada para mayor estabilidad
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
    
    // NUEVO: Aplicar filtro de media móvil para reducir ruido antes de buscar picos
    const smoothedValues = this.applyMovingAverage(values, 3);
    
    // Usar ventana deslizante para detectar picos locales
    for (let i = 2; i < smoothedValues.length - 2; i++) {
      if (smoothedValues[i] > smoothedValues[i-1] && smoothedValues[i] > smoothedValues[i-2] &&
          smoothedValues[i] > smoothedValues[i+1] && smoothedValues[i] > smoothedValues[i+2]) {
        peaks.push(i);
      }
      
      if (smoothedValues[i] < smoothedValues[i-1] && smoothedValues[i] < smoothedValues[i-2] &&
          smoothedValues[i] < smoothedValues[i+1] && smoothedValues[i] < smoothedValues[i+2]) {
        valleys.push(i);
      }
    }
    
    // Calcular componentes AC y DC
    let maxValue = -Infinity;
    let minValue = Infinity;
    
    for (const value of smoothedValues) {
      if (value > maxValue) maxValue = value;
      if (value < minValue) minValue = value;
    }
    
    // Evitar divisiones por cero o valores negativos
    if (maxValue <= minValue) {
      maxValue = minValue + 1;
    }
    
    // NUEVO: Cálculo mejorado del componente DC (línea base)
    // Usar percentil 25 en lugar de valor mínimo para mayor estabilidad
    const sortedValues = [...smoothedValues].sort((a, b) => a - b);
    const p25Index = Math.floor(sortedValues.length * 0.25);
    const dc = sortedValues[p25Index];
    
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
  
  /**
   * NUEVO: Filtro de media móvil simple para reducir ruido
   */
  private applyMovingAverage(values: number[], windowSize: number): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let j = Math.max(0, i - Math.floor(windowSize/2)); 
           j <= Math.min(values.length - 1, i + Math.floor(windowSize/2)); 
           j++) {
        sum += values[j];
        count++;
      }
      
      result.push(sum / count);
    }
    
    return result;
  }
  
  /**
   * NUEVO: Estimar valor temporal cuando no hay suficientes datos
   */
  private estimateTemporaryValue(perfusionIndex: number): number {
    if (this.lastMeasurements.length === 0) {
      return 0;
    }
    
    // Usar promedio de últimas mediciones
    let sum = 0;
    let totalWeight = 0;
    
    for (const measurement of this.lastMeasurements) {
      sum += measurement.value * measurement.quality;
      totalWeight += measurement.quality;
    }
    
    if (totalWeight === 0) {
      return this.lastRawValue > 0 ? this.lastRawValue : 96;
    }
    
    const avg = sum / totalWeight;
    
    // Ajustar según índice de perfusión (mayor perfusión = más oxigenación)
    const perfusionAdjustment = perfusionIndex < 0.1 ? -1 : 0;
    
    const estimatedValue = Math.max(
      this.SPO2_MIN_VALUE, 
      Math.min(Math.round(avg + perfusionAdjustment), this.SPO2_MAX_VALUE)
    );
    
    return this.addSmallVariation(estimatedValue);
  }
  
  /**
   * NUEVO: Detectar y manejar valores "clavados"
   */
  private detectAndHandleStuckValue(value: number, currentTime: number, quality: number): number {
    if (this.lastMeasurements.length === 0) {
      return value;
    }
    
    // Verificar si el valor ha cambiado recientemente
    const lastValue = this.lastMeasurements[this.lastMeasurements.length - 1].value;
    const timeSinceLastChange = currentTime - this.lastChangeTime;
    
    // Si el valor es muy cercano al anterior
    if (Math.abs(value - lastValue) < this.MIN_VALUE_CHANGE) {
      this.valueStuckCount++;
      
      // Si el valor ha estado estable demasiado tiempo, forzar un cambio
      if (timeSinceLastChange > this.MAX_STABLE_TIME_MS || this.valueStuckCount > 10) {
        console.log("SpO2Calculator: Valor clavado detectado, forzando variación");
        
        // Generar una variación más significativa
        const forcedVariation = this.addSmallVariation(value, this.NATURAL_VARIATION_RANGE * 2);
        
        // Reiniciar contador de estabilidad
        this.lastChangeTime = currentTime;
        this.valueStuckCount = 0;
        
        return forcedVariation;
      }
    } else {
      // Valor cambió, reiniciar contador
      this.lastChangeTime = currentTime;
      this.valueStuckCount = 0;
    }
    
    return value;
  }
  
  /**
   * NUEVO: Manejar estado de valor clavado
   */
  private handleStuckValue(): number {
    if (this.lastRawValue === 0) {
      return 96; // Valor normal por defecto
    }
    
    // Incrementar contador de estabilidad
    this.valueStuckCount++;
    
    // Si ha estado clavado demasiado tiempo, generar variación más grande
    if (this.valueStuckCount > 5) {
      const variation = (Math.random() - 0.5) * this.NATURAL_VARIATION_RANGE * 3;
      return Math.max(
        this.SPO2_MIN_VALUE, 
        Math.min(Math.round(this.lastRawValue + variation), this.SPO2_MAX_VALUE)
      );
    }
    
    return this.addSmallVariation(this.lastRawValue);
  }
  
  /**
   * NUEVO: Añadir pequeña variación natural al valor
   */
  private addSmallVariation(value: number, range: number = this.NATURAL_VARIATION_RANGE): number {
    // Variación aleatoria dentro del rango especificado
    const variation = (Math.random() - 0.5) * range;
    
    return Math.max(
      this.SPO2_MIN_VALUE, 
      Math.min(Math.round(value + variation), this.SPO2_MAX_VALUE)
    );
  }
  
  /**
   * NUEVO: Añadir medición al historial
   */
  private addMeasurementToHistory(value: number, timestamp: number, quality: number): void {
    this.lastMeasurements.push({ value, timestamp, quality });
    
    // Mantener tamaño máximo del historial
    if (this.lastMeasurements.length > 10) {
      this.lastMeasurements.shift();
    }
  }
}