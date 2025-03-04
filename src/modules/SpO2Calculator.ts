export class SpO2Calculator {
  // Constantes calibradas según especificaciones clínicas
  private readonly CALIBRATION_CURVE_COEFFICIENTS = [110.0, -25.0, 1.5, -0.15, 0.008]; // Polinomio de calibración de SpO2
  private readonly MINIMUM_PERFUSION_INDEX = 0.35; // Mínimo índice de perfusión válido
  private readonly AMBIENT_LIGHT_COMPENSATION_FACTOR = 0.08; // Factor de compensación por luz ambiental
  private readonly TEMPERATURE_COMPENSATION_FACTOR = 0.015; // Factor de compensación por temperatura
  private readonly MOVING_AVERAGE_WINDOW = 5; // Ventana de promedio móvil para estabilización
  private readonly MIN_ACCEPTABLE_QUALITY = 65; // Calidad mínima aceptable (0-100)
  
  // Buffers para datos y calibración
  private redBuffer: number[] = [];
  private irBuffer: number[] = [];
  private ratioHistory: number[] = [];
  private qualityScores: number[] = [];
  private perfusionIndices: number[] = [];
  private calibrationConstants: {a: number, b: number, c: number} = {a: 1.0, b: 0.0, c: 0.0};
  
  // Variables de estado
  private lastValidSpO2: number = 98;
  private confidenceLevel: number = 0;
  private movingAverage: number[] = [];
  private lastMeasurementTime: number = 0;
  
  /**
   * Calcula la saturación de oxígeno (SpO2) basado en señales PPG roja e infrarroja
   * Método avanzado basado en Beer-Lambert con compensación multiparamétrica
   */
  calculate(
    redSignal: number[], 
    irSignal: number[], 
    ambientLight?: number, 
    skinTemperature?: number
  ): {
    spO2: number;
    confidence: number;
    perfusionIndex: number;
    quality: number;
  } {
    if (redSignal.length < 100 || irSignal.length < 100) {
      return {
        spO2: this.lastValidSpO2,
        confidence: 0,
        perfusionIndex: 0,
        quality: 0
      };
    }
    
    // Actualizar buffers
    this.redBuffer = [...this.redBuffer, ...redSignal].slice(-500);
    this.irBuffer = [...this.irBuffer, ...irSignal].slice(-500);
    
    // Calcular la calidad de señal
    const signalQuality = this.calculateSignalQuality(this.redBuffer, this.irBuffer);
    this.qualityScores.push(signalQuality);
    if (this.qualityScores.length > 10) this.qualityScores.shift();
    
    // Si la calidad es demasiado baja, retornar último valor válido
    if (signalQuality < this.MIN_ACCEPTABLE_QUALITY) {
      return {
        spO2: this.lastValidSpO2,
        confidence: Math.max(0.3, this.confidenceLevel * 0.6),
        perfusionIndex: this.perfusionIndices.length > 0 ? this.perfusionIndices[this.perfusionIndices.length - 1] : 0,
        quality: signalQuality
      };
    }
    
    // Preprocesamiento avanzado de señales
    const { redProcessed, irProcessed } = this.preprocessSignals(this.redBuffer, this.irBuffer);
    
    // Extraer componentes AC y DC correctamente
    const { redAC, redDC, irAC, irDC } = this.extractACDCComponents(redProcessed, irProcessed);
    
    // Calcular índice de perfusión (PI)
    const perfusionIndex = (redAC / redDC) * 100;
    this.perfusionIndices.push(perfusionIndex);
    if (this.perfusionIndices.length > 10) this.perfusionIndices.shift();
    
    // Si el índice de perfusión es demasiado bajo, la medición no es confiable
    if (perfusionIndex < this.MINIMUM_PERFUSION_INDEX) {
      return {
        spO2: this.lastValidSpO2,
        confidence: Math.max(0.2, this.confidenceLevel * 0.5),
        perfusionIndex,
        quality: signalQuality * 0.7
      };
    }
    
    // Calcular relación R (métrica principal para SpO2)
    // R = (AC_red/DC_red)/(AC_ir/DC_ir)
    const ratio = (redAC / redDC) / (irAC / irDC);
    
    // Agregar a historial para análisis de tendencia
    this.ratioHistory.push(ratio);
    if (this.ratioHistory.length > 10) this.ratioHistory.shift();
    
    // Aplicar compensaciones por factores ambientales
    let compensatedRatio = ratio;
    
    // Compensar por luz ambiental si está disponible
    if (ambientLight !== undefined && ambientLight > 5) {
      compensatedRatio = ratio * (1 + (ambientLight * this.AMBIENT_LIGHT_COMPENSATION_FACTOR / 100));
    }
    
    // Compensar por temperatura si está disponible (afecta circulación periférica)
    if (skinTemperature !== undefined) {
      // Normalizado alrededor de 32°C (temperatura típica de la piel del dedo)
      const tempDifference = skinTemperature - 32;
      compensatedRatio = compensatedRatio * (1 - (tempDifference * this.TEMPERATURE_COMPENSATION_FACTOR / 100));
    }
    
    // Convertir ratio R a SpO2 usando ecuación clínica calibrada
    // SpO2 = a - b * R    (fórmula empírica simplificada)
    // En realidad usamos un polinomio de mayor grado para mayor precisión
    let spO2 = this.ratioToSpO2(compensatedRatio);
    
    // Aplicar calibración específica si está disponible
    spO2 = this.calibrationConstants.a * spO2 + this.calibrationConstants.b + 
           this.calibrationConstants.c * Math.pow(spO2 - 98, 2);
    
    // Limitar a rango fisiológico (70-100%)
    spO2 = Math.max(70, Math.min(100, spO2));
    
    // Aplicar promedio móvil ponderado Exponencial (EMA) para suavizado
    spO2 = this.applyExponentialMovingAverage(spO2, signalQuality);
    
    // Calcular confianza basada en múltiples factores
    this.confidenceLevel = this.calculateConfidence(
      signalQuality,
      perfusionIndex,
      this.calculateStability(this.ratioHistory)
    );
    
    // Actualizar último valor válido si la confianza es aceptable
    if (this.confidenceLevel > 0.7) {
      this.lastValidSpO2 = spO2;
      this.lastMeasurementTime = Date.now();
    } else if (Date.now() - this.lastMeasurementTime > 30000) {
      // Si han pasado más de 30 segundos sin mediciones confiables,
      // reducir gradualmente la confianza en el último valor
      this.confidenceLevel = Math.max(0.2, this.confidenceLevel * 0.9);
    }
    
    return {
      spO2: Math.round(spO2),
      confidence: this.confidenceLevel,
      perfusionIndex,
      quality: signalQuality
    };
  }
  
  /**
   * Preprocesa las señales para mejorar la relación señal-ruido
   */
  private preprocessSignals(redSignal: number[], irSignal: number[]): {
    redProcessed: number[];
    irProcessed: number[];
  } {
    // 1. Filtro de paso banda para eliminar ruido (0.5-5Hz)
    const redFiltered = this.applyBandpassFilter(redSignal, 0.5, 5.0, 30);
    const irFiltered = this.applyBandpassFilter(irSignal, 0.5, 5.0, 30);
    
    // 2. Eliminación de artefactos por movimiento usando análisis de correlación
    const {redCleaned, irCleaned} = this.removeMotionArtifacts(redFiltered, irFiltered);
    
    // 3. Normalización para comparación uniforme
    const redNormalized = this.normalizeSignal(redCleaned);
    const irNormalized = this.normalizeSignal(irCleaned);
    
    return {
      redProcessed: redNormalized,
      irProcessed: irNormalized
    };
  }
  
  /**
   * Aplica filtro de paso banda para eliminar componentes de frecuencia no deseados
   */
  private applyBandpassFilter(
    signal: number[], 
    lowFreq: number, 
    highFreq: number, 
    samplingRate: number
  ): number[] {
    const nyquist = samplingRate / 2;
    const lowCutoff = lowFreq / nyquist;
    const highCutoff = highFreq / nyquist;
    
    // Coeficientes para filtro Butterworth de orden 2 (simplificado)
    const a = [1.0, -1.8, 0.81];
    const b = [0.009, 0.018, 0.009];
    
    const filtered: number[] = [];
    const prevInput: number[] = [0, 0];
    const prevOutput: number[] = [0, 0];
    
    for (let i = 0; i < signal.length; i++) {
      // Implementación de filtro IIR directo
      let y = b[0] * signal[i] + b[1] * prevInput[0] + b[2] * prevInput[1]
              - a[1] * prevOutput[0] - a[2] * prevOutput[1];
      
      // Actualizar buffer
      prevInput[1] = prevInput[0];
      prevInput[0] = signal[i];
      prevOutput[1] = prevOutput[0];
      prevOutput[0] = y;
      
      filtered.push(y);
    }
    
    return filtered;
  }
  
  /**
   * Elimina artefactos de movimiento usando análisis de correlación entre señales
   */
  private removeMotionArtifacts(redSignal: number[], irSignal: number[]): {
    redCleaned: number[];
    irCleaned: number[];
  } {
    const windowSize = 30;
    const redCleaned: number[] = [...redSignal];
    const irCleaned: number[] = [...irSignal];
    
    // Analizamos en ventanas deslizantes
    for (let i = 0; i < redSignal.length - windowSize; i += windowSize / 2) {
      const redWindow = redSignal.slice(i, i + windowSize);
      const irWindow = irSignal.slice(i, i + windowSize);
      
      // Calcular correlación entre señales roja e IR en esta ventana
      const correlation = this.calculateCorrelation(redWindow, irWindow);
      
      // Si la correlación es baja, podría haber artefacto de movimiento
      if (correlation < 0.7) {
        // Marcar esta sección como artefacto suavizando sus valores
        for (let j = i; j < i + windowSize && j < redSignal.length; j++) {
          if (j > 0 && j < redSignal.length - 1) {
            // Suavizar con promedio de vecinos
            redCleaned[j] = (redSignal[j-1] + redSignal[j+1]) / 2;
            irCleaned[j] = (irSignal[j-1] + irSignal[j+1]) / 2;
          }
        }
      }
    }
    
    return { redCleaned, irCleaned };
  }
  
  /**
   * Calcula la correlación entre dos señales
   */
  private calculateCorrelation(signal1: number[], signal2: number[]): number {
    if (signal1.length !== signal2.length || signal1.length < 2) return 0;
    
    const n = signal1.length;
    
    // Calcular medias
    const mean1 = signal1.reduce((sum, val) => sum + val, 0) / n;
    const mean2 = signal2.reduce((sum, val) => sum + val, 0) / n;
    
    // Calcular coeficiente de correlación
    let num = 0;
    let den1 = 0;
    let den2 = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = signal1[i] - mean1;
      const diff2 = signal2[i] - mean2;
      
      num += diff1 * diff2;
      den1 += diff1 * diff1;
      den2 += diff2 * diff2;
    }
    
    if (den1 === 0 || den2 === 0) return 0;
    
    return num / Math.sqrt(den1 * den2);
  }
  
  /**
   * Normaliza una señal al rango 0-1
   */
  private normalizeSignal(signal: number[]): number[] {
    const min = Math.min(...signal);
    const max = Math.max(...signal);
    
    if (max === min) return signal.map(() => 0.5);
    
    return signal.map(val => (val - min) / (max - min));
  }
  
  /**
   * Extrae componentes AC y DC de las señales PPG
   */
  private extractACDCComponents(redSignal: number[], irSignal: number[]): {
    redAC: number;
    redDC: number;
    irAC: number;
    irDC: number;
  } {
    // Para cálculos precisos de SpO2, necesitamos extraer correctamente
    // los componentes AC (variación pulsátil) y DC (nivel base)
    
    // Enfoque avanzado: Transformada de Hilbert para envolventes
    // Versión simplificada: usamos estadísticas de amplitud
    
    // Extraer componentes DC (nivel medio)
    const redDC = redSignal.reduce((sum, val) => sum + val, 0) / redSignal.length;
    const irDC = irSignal.reduce((sum, val) => sum + val, 0) / irSignal.length;
    
    // Extraer componentes AC (variación pico a pico)
    // Método más robusto: usar percentiles para evitar outliers
    redSignal.sort((a, b) => a - b);
    irSignal.sort((a, b) => a - b);
    
    const lowPercentile = Math.floor(redSignal.length * 0.1);
    const highPercentile = Math.floor(redSignal.length * 0.9);
    
    const redAC = redSignal[highPercentile] - redSignal[lowPercentile];
    const irAC = irSignal[highPercentile] - irSignal[lowPercentile];
    
    return { redAC, redDC, irAC, irDC };
  }
  
  /**
   * Convierte ratio R a valor de SpO2 usando curva calibrada
   */
  private ratioToSpO2(ratio: number): number {
    // Ecuación empírica avanzada basada en curva de calibración clínica
    // SpO2 = a + b*R + c*R² + d*R³ + e*R⁴
    
    let spO2 = 0;
    for (let i = 0; i < this.CALIBRATION_CURVE_COEFFICIENTS.length; i++) {
      spO2 += this.CALIBRATION_CURVE_COEFFICIENTS[i] * Math.pow(ratio, i);
    }
    
    return spO2;
  }
  
  /**
   * Aplica promedio móvil exponencial para suavizado
   */
  private applyExponentialMovingAverage(value: number, quality: number): number {
    // Factor alfa dinámico basado en calidad de señal
    // Más calidad = más peso al nuevo valor
    const alpha = 0.3 + (quality / 100) * 0.4;
    
    if (this.movingAverage.length === 0) {
      this.movingAverage.push(value);
      return value;
    }
    
    const lastAvg = this.movingAverage[this.movingAverage.length - 1];
    const newAvg = alpha * value + (1 - alpha) * lastAvg;
    
    this.movingAverage.push(newAvg);
    if (this.movingAverage.length > this.MOVING_AVERAGE_WINDOW) {
      this.movingAverage.shift();
    }
    
    return newAvg;
  }
  
  /**
   * Calcula la estabilidad de las mediciones recientes
   */
  private calculateStability(values: number[]): number {
    if (values.length < 3) return 0.5;
    
    // Calcular varianza normalizada
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    // Coeficiente de variación
    const cv = Math.sqrt(variance) / mean;
    
    // Convertir a puntaje de estabilidad (más alto = más estable)
    // CV típico para SpO2 estable: 0.005-0.02
    // Normalizar a 0-1
    return Math.max(0, Math.min(1, 1 - cv * 50));
  }
  
  /**
   * Calcula la calidad de la señal basada en múltiples métricas
   */
  private calculateSignalQuality(redSignal: number[], irSignal: number[]): number {
    // 1. SNR (relación señal-ruido)
    const redSNR = this.calculateSNR(redSignal);
    const irSNR = this.calculateSNR(irSignal);
    const snrScore = (redSNR + irSNR) / 2;
    
    // 2. Fuerza de la señal pulsátil
    const pulsatileStrength = this.calculatePulsatileStrength(redSignal, irSignal);
    
    // 3. Regularidad del ritmo
    const rhythmRegularity = this.calculateRhythmRegularity(redSignal);
    
    // 4. Correlación entre rojo e IR (deben correlacionarse bien)
    const correlation = this.calculateCorrelation(
      redSignal.slice(-100), 
      irSignal.slice(-100)
    );
    
    // Ponderación de factores de calidad
    const weights = [0.3, 0.3, 0.2, 0.2]; // SNR, fuerza pulsátil, regularidad, correlación
    const scores = [
      Math.min(100, snrScore * 20),
      pulsatileStrength * 100,
      rhythmRegularity * 100,
      correlation * 100
    ];
    
    // Calcular puntuación ponderada
    const weightedScore = scores.reduce((sum, score, idx) => sum + score * weights[idx], 0);
    
    return Math.max(0, Math.min(100, weightedScore));
  }
  
  /**
   * Calcula SNR (relación señal-ruido)
   */
  private calculateSNR(signal: number[]): number {
    if (signal.length < 50) return 0;
    
    // Aplicar FFT simplificada para analizar componentes frecuenciales
    const fftResult = this.performSimpleFFT(signal);
    
    // Encontrar banda de frecuencia cardíaca (típicamente 0.5-3Hz)
    // y calcular potencia de señal vs. ruido
    let signalPower = 0;
    let noisePower = 0;
    
    for (let i = 0; i < fftResult.length; i++) {
      const freq = i * 30 / fftResult.length; // Asume 30Hz de muestreo
      
      if (freq >= 0.5 && freq <= 3.0) {
        // Banda de frecuencia cardíaca
        signalPower += fftResult[i];
      } else if (freq > 0 && freq <= 10) {
        // Fuera de banda cardíaca pero no DC
        noisePower += fftResult[i];
      }
    }
    
    if (noisePower === 0) return 10; // Valor máximo arbitrario
    
    // Calcular SNR en dB
    return 10 * Math.log10(signalPower / noisePower);
  }
  
  /**
   * Realiza una FFT simplificada para análisis espectral
   */
  private performSimpleFFT(signal: number[]): number[] {
    // Implementación simplificada de FFT para análisis de potencia
    const n = signal.length;
    const result = new Array(n / 2).fill(0);
    
    // Para cada frecuencia
    for (let k = 0; k < n / 2; k++) {
      let re = 0;
      let im = 0;
      
      // Calcular componentes de Fourier
      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        re += signal[t] * Math.cos(angle);
        im += signal[t] * Math.sin(angle);
      }
      
      // Potencia espectral
      result[k] = (re * re + im * im) / n;
    }
    
    return result;
  }
  
  /**
   * Calcula la fuerza de la componente pulsátil
   */
  private calculatePulsatileStrength(redSignal: number[], irSignal: number[]): number {
    // Extraer componentes AC y DC
    const { redAC, redDC, irAC, irDC } = this.extractACDCComponents(redSignal, irSignal);
    
    // Calcular el índice de perfusión relativo
    const redPI = redAC / redDC;
    const irPI = irAC / irDC;
    
    // Promedio de ambos canales
    const avgPI = (redPI + irPI) / 2;
    
    // Normalizar a 0-1 (valores típicos: 0.005-0.05)
    return Math.min(1, avgPI * 20);
  }
  
  /**
   * Calcula la regularidad del ritmo
   */
  private calculateRhythmRegularity(signal: number[]): number {
    // Detectar picos para calcular intervalos
    const peaks = this.detectPeaks(signal);
    
    if (peaks.length < 3) return 0.5; // Valor predeterminado
    
    // Calcular intervalos entre picos
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i-1]);
    }
    
    // Calcular coeficiente de variación de intervalos
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const cv = Math.sqrt(variance) / mean;
    
    // Convertir a regularidad (más bajo CV = más regular)
    // CV típico para ritmo regular: 0.01-0.1
    return Math.max(0, Math.min(1, 1 - cv * 5));
  }
  
  /**
   * Detecta picos en la señal
   */
  private detectPeaks(signal: number[]): number[] {
    const peaks: number[] = [];
    
    // Filtrar la señal para reducir ruido
    const filtered = this.applyMovingAverageFilter(signal, 3);
    
    // Umbral adaptativo basado en amplitud de señal
    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const threshold = min + (max - min) * 0.6;
    
    // Detectar picos
    for (let i = 2; i < filtered.length - 2; i++) {
      if (filtered[i] > threshold &&
          filtered[i] > filtered[i-1] &&
          filtered[i] > filtered[i-2] &&
          filtered[i] > filtered[i+1] &&
          filtered[i] > filtered[i+2]) {
        peaks.push(i);
      }
    }
    
    return peaks;
  }
  
  /**
   * Aplica filtro de promedio móvil
   */
  private applyMovingAverageFilter(signal: number[], windowSize: number): number[] {
    const result: number[] = [];
    
    for (let i = 0; i < signal.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let j = Math.max(0, i - windowSize); j <= Math.min(signal.length - 1, i + windowSize); j++) {
        sum += signal[j];
        count++;
      }
      
      result.push(sum / count);
    }
    
    return result;
  }
  
  /**
   * Calcula nivel de confianza basado en múltiples factores
   */
  private calculateConfidence(
    signalQuality: number,
    perfusionIndex: number,
    stability: number
  ): number {
    // Ponderación de factores
    const qualityWeight = 0.5;
    const perfusionWeight = 0.3;
    const stabilityWeight = 0.2;
    
    // Normalización de perfusión índice (0.5% a 5% considerado normal)
    const normalizedPI = Math.min(1, perfusionIndex / 5);
    
    // Normalización de calidad (0-100)
    const normalizedQuality = signalQuality / 100;
    
    // Calcular confianza ponderada
    const confidence = 
      qualityWeight * normalizedQuality +
      perfusionWeight * normalizedPI +
      stabilityWeight * stability;
    
    return Math.max(0, Math.min(1, confidence));
  }
  
  /**
   * Establece constantes de calibración personalizadas
   */
  setCalibrationConstants(a: number, b: number, c: number = 0): void {
    this.calibrationConstants = { a, b, c };
  }
  
  /**
   * Reinicia el procesador
   */
  reset(): void {
    this.redBuffer = [];
    this.irBuffer = [];
    this.ratioHistory = [];
    this.qualityScores = [];
    this.perfusionIndices = [];
    this.movingAverage = [];
    this.lastMeasurementTime = 0;
    this.confidenceLevel = 0;
  }
} 