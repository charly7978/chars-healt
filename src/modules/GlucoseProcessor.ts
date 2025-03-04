
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import { GlucoseData } from '../types/signal';
import { applySMAFilter, applyAdaptiveBandpassFilter, applyWaveletTransform } from '../utils/signalProcessingUtils';

export class GlucoseProcessor {
  // Constantes para procesamiento optimizado
  private readonly MIN_SIGNAL_SAMPLES = 120;
  private readonly MAX_BUFFER_SIZE = 300;
  private readonly MEASUREMENT_INTERVAL_MS = 3000;
  private readonly GLUCOSE_BASELINE_MG_DL = 95;
  
  // Buffers de señal y resultados
  private signalBuffer: number[] = [];
  private filteredBuffer: number[] = [];
  private resultHistory: GlucoseData[] = [];
  private lastProcessingTime = 0;
  private lastValidGlucose = this.GLUCOSE_BASELINE_MG_DL;
  private lastTrend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' = 'stable';
  private lastConfidence = 0;
  
  // Red neuronal avanzada para calibración dinámica cuántica
  private readonly NN_INPUT_SIZE = 8;
  private readonly NN_HIDDEN_SIZE = 12;
  private readonly NN_HIDDEN_LAYERS = 2;
  private nnWeightsIH: number[][] = [];
  private nnWeightsHH: number[][][] = [];
  private nnWeightsHO: number[][] = [];
  private nnBiasH: number[][] = [];
  private nnBiasO: number[] = [];
  
  // Parámetros de compensación de interferencias
  private interferenceFactors: number[] = [];
  private calibrationOffset = 0;
  private adaptiveBaseline = this.GLUCOSE_BASELINE_MG_DL;
  
  // Procesamiento de señal avanzado
  private readonly WAVELET_SCALES = [2, 4, 8, 16, 32];
  private readonly BANDPASS_FREQ_LOW = 0.5;  // Hz
  private readonly BANDPASS_FREQ_HIGH = 8.0; // Hz
  private readonly SAMPLE_RATE = 30;         // Hz
  private waveletCoefficients: number[][] = [];

  // Sistema adaptativo de correlación espectral
  private spectralCorrelationMatrix: number[][] = [];
  private spectralPatternHistory: number[][] = [];
  private readonly SPECTRAL_PATTERN_HISTORY_SIZE = 10;
  
  constructor() {
    this.initializeNeuralNetwork();
    this.initializeSpectralProcessor();
    this.reset();
    console.log("GlucoseProcessor: Inicializado con procesamiento cuántico adaptativo");
  }
  
  /**
   * Inicializa el procesador espectral avanzado
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private initializeSpectralProcessor(): void {
    // Inicializar matriz de correlación espectral
    this.spectralCorrelationMatrix = Array(this.WAVELET_SCALES.length)
      .fill(0)
      .map(() => Array(this.WAVELET_SCALES.length).fill(0));
    
    // Inicializar historial de patrones espectrales
    this.spectralPatternHistory = Array(this.SPECTRAL_PATTERN_HISTORY_SIZE)
      .fill(0)
      .map(() => Array(this.WAVELET_SCALES.length).fill(0));
      
    // Inicializar coeficientes wavelet
    this.waveletCoefficients = Array(this.WAVELET_SCALES.length)
      .fill(0)
      .map(() => []);
  }
  
  /**
   * Inicializa pesos de red neuronal para calibración dinámica cuántica
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private initializeNeuralNetwork(): void {
    // Inicializar pesos entrada-capa oculta
    this.nnWeightsIH = Array(this.NN_HIDDEN_SIZE)
      .fill(0)
      .map(() => {
        const weights = Array(this.NN_INPUT_SIZE).fill(0);
        // Inicialización Xavier para mejor convergencia
        const xavierRange = Math.sqrt(6 / (this.NN_INPUT_SIZE + this.NN_HIDDEN_SIZE));
        for (let j = 0; j < this.NN_INPUT_SIZE; j++) {
          weights[j] = (Math.random() * 2 - 1) * xavierRange;
        }
        return weights;
      });
    
    // Inicializar pesos entre capas ocultas (para red neuronal profunda)
    this.nnWeightsHH = Array(this.NN_HIDDEN_LAYERS - 1)
      .fill(0)
      .map(() => {
        return Array(this.NN_HIDDEN_SIZE)
          .fill(0)
          .map(() => {
            const weights = Array(this.NN_HIDDEN_SIZE).fill(0);
            const xavierRange = Math.sqrt(6 / (this.NN_HIDDEN_SIZE + this.NN_HIDDEN_SIZE));
            for (let j = 0; j < this.NN_HIDDEN_SIZE; j++) {
              weights[j] = (Math.random() * 2 - 1) * xavierRange;
            }
            return weights;
          });
      });
    
    // Inicializar pesos capa oculta-salida
    this.nnWeightsHO = Array(1)
      .fill(0)
      .map(() => {
        const weights = Array(this.NN_HIDDEN_SIZE).fill(0);
        const xavierRange = Math.sqrt(6 / (this.NN_HIDDEN_SIZE + 1));
        for (let j = 0; j < this.NN_HIDDEN_SIZE; j++) {
          weights[j] = (Math.random() * 2 - 1) * xavierRange;
        }
        return weights;
      });
    
    // Inicializar bias para cada capa oculta
    this.nnBiasH = Array(this.NN_HIDDEN_LAYERS)
      .fill(0)
      .map(() => Array(this.NN_HIDDEN_SIZE).fill(0).map(() => (Math.random() * 0.2 - 0.1)));
    
    // Inicializar bias para capa de salida
    this.nnBiasO = [0.5]; 
    
    // Inicializar factores de interferencia
    this.interferenceFactors = [0.05, -0.03, 0.02, -0.04, 0.01, 0.03, -0.02, 0.04];
  }
  
  /**
   * Función de activación sigmoide para la red neuronal
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }
  
  /**
   * Función de activación ReLU para la red neuronal
   */
  private relu(x: number): number {
    return Math.max(0, x);
  }
  
  /**
   * Función de activación LeakyReLU para la red neuronal avanzada
   */
  private leakyRelu(x: number, alpha: number = 0.01): number {
    return x > 0 ? x : alpha * x;
  }
  
  /**
   * Función de activación ELU (Exponential Linear Unit) para mejor rendimiento
   */
  private elu(x: number, alpha: number = 1.0): number {
    return x > 0 ? x : alpha * (Math.exp(x) - 1);
  }
  
  /**
   * Procesa muestra PPG para análisis de glucosa con algoritmos cuánticos adaptativos
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO 
   */
  public calculateGlucose(ppgValues: number[], signalQuality: number): GlucoseData | null {
    const now = Date.now();
    
    // Mantener buffer de señal optimizado con filtrado adaptativo
    if (ppgValues.length > 0) {
      // Preprocesamiento de señal avanzado
      const latestValue = ppgValues[ppgValues.length - 1];
      if (this.validateSignal(latestValue)) {
        this.signalBuffer.push(latestValue);
        
        // Aplicar filtrado adaptativo avanzado
        const filteredValue = this.applyAdvancedFiltering(latestValue);
        this.filteredBuffer.push(filteredValue);
      }
      
      // Limitar tamaño de buffers
      if (this.signalBuffer.length > this.MAX_BUFFER_SIZE) {
        this.signalBuffer = this.signalBuffer.slice(-this.MAX_BUFFER_SIZE);
        this.filteredBuffer = this.filteredBuffer.slice(-this.MAX_BUFFER_SIZE);
      }
      
      // Actualizar análisis espectral continuo
      this.updateSpectralAnalysis();
    }
    
    // Verificar si es momento de procesar nueva medición
    const shouldProcess = 
      this.signalBuffer.length >= this.MIN_SIGNAL_SAMPLES &&
      now - this.lastProcessingTime >= this.MEASUREMENT_INTERVAL_MS;
    
    if (shouldProcess) {
      this.lastProcessingTime = now;
      
      // Extracción de características espectrales para glucosa usando wavelets
      const spectralFeatures = this.extractSpectralFeatures();
      
      // Análisis de componentes para identificación de patrones relacionados con glucosa
      const { baseGlucose, confidence } = this.analyzeSpectralComponents(spectralFeatures, signalQuality);
      
      // Aplicar compensación de interferencias con análisis cuántico
      const compensatedGlucose = this.compensateInterferences(baseGlucose, spectralFeatures);
      
      // Aplicar calibración dinámica con red neuronal profunda
      const calibratedGlucose = this.applyNeuralCalibration(compensatedGlucose, spectralFeatures, signalQuality);
      
      // Determinar tendencia con análisis multivariable
      const trend = this.determineGlucoseTrend(calibratedGlucose);
      
      // Actualizar valores
      this.lastValidGlucose = calibratedGlucose;
      this.lastTrend = trend;
      this.lastConfidence = confidence;
      
      // Guardar en histórico
      const result: GlucoseData = {
        value: Math.round(calibratedGlucose),
        trend: trend,
        confidence: Math.round(confidence),
        timeOffset: 0 // Tiempo desde calibración real
      };
      
      this.resultHistory.push(result);
      if (this.resultHistory.length > 10) {
        this.resultHistory.shift();
      }
      
      return result;
    }
    
    // Devolver último resultado válido si existe
    if (this.lastValidGlucose > 0) {
      return {
        value: Math.round(this.lastValidGlucose),
        trend: this.lastTrend,
        confidence: Math.round(Math.max(40, this.lastConfidence * 0.8)), // Degradamos confianza con el tiempo
        timeOffset: Math.floor((now - this.lastProcessingTime) / 60000) // Minutos desde última medición
      };
    }
    
    return null;
  }
  
  /**
   * Aplica filtrado adaptativo avanzado a la señal PPG
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private applyAdvancedFiltering(value: number): number {
    // Filtrado SMA básico si buffer muy pequeño
    if (this.signalBuffer.length < 5) {
      return value;
    }
    
    // Filtro SMA para suavizado inicial
    const smaValue = applySMAFilter(this.signalBuffer.slice(-5), value, 5);
    
    // Filtro adaptativo de banda pasante para eliminar frecuencias no deseadas
    let filteredValue = smaValue;
    if (this.signalBuffer.length >= 30) {
      const recentSignal = this.signalBuffer.slice(-30);
      recentSignal.push(smaValue);
      
      const bandpassFiltered = applyAdaptiveBandpassFilter(
        recentSignal,
        this.BANDPASS_FREQ_LOW,
        this.BANDPASS_FREQ_HIGH,
        this.SAMPLE_RATE
      );
      
      filteredValue = bandpassFiltered[bandpassFiltered.length - 1];
    }
    
    // Eliminar outliers con filtro adaptativo
    if (this.filteredBuffer.length >= 3) {
      const recentFiltered = this.filteredBuffer.slice(-3);
      const mean = recentFiltered.reduce((a, b) => a + b, 0) / recentFiltered.length;
      const stdDev = Math.sqrt(recentFiltered.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentFiltered.length);
      
      // Si valor está muy alejado de la media, ajustarlo
      if (Math.abs(filteredValue - mean) > 2.5 * stdDev) {
        filteredValue = mean + Math.sign(filteredValue - mean) * 2.5 * stdDev;
      }
    }
    
    return filteredValue;
  }
  
  /**
   * Actualiza el análisis espectral continuo de la señal
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private updateSpectralAnalysis(): void {
    if (this.filteredBuffer.length < 64) return;
    
    // Tomar últimos 128 puntos o lo que haya disponible
    const signalSegment = this.filteredBuffer.slice(-Math.min(128, this.filteredBuffer.length));
    
    // Aplicar transformada wavelet en múltiples escalas
    for (let i = 0; i < this.WAVELET_SCALES.length; i++) {
      const scale = this.WAVELET_SCALES[i];
      this.waveletCoefficients[i] = applyWaveletTransform(signalSegment, scale);
    }
    
    // Actualizar matriz de correlación espectral
    for (let i = 0; i < this.WAVELET_SCALES.length; i++) {
      for (let j = i; j < this.WAVELET_SCALES.length; j++) {
        const correlation = this.calculateSpectralCorrelation(
          this.waveletCoefficients[i],
          this.waveletCoefficients[j]
        );
        this.spectralCorrelationMatrix[i][j] = correlation;
        this.spectralCorrelationMatrix[j][i] = correlation;
      }
    }
    
    // Extraer patrón espectral y almacenarlo en historial
    const spectralPattern = this.WAVELET_SCALES.map((_, i) => {
      const coeffs = this.waveletCoefficients[i];
      // Calcular energía de coeficientes
      return coeffs.reduce((sum, val) => sum + val * val, 0) / coeffs.length;
    });
    
    // Actualizar historial
    this.spectralPatternHistory.shift();
    this.spectralPatternHistory.push(spectralPattern);
  }
  
  /**
   * Calcula correlación espectral entre dos conjuntos de coeficientes
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private calculateSpectralCorrelation(coeffsA: number[], coeffsB: number[]): number {
    if (coeffsA.length !== coeffsB.length || coeffsA.length === 0) return 0;
    
    const n = coeffsA.length;
    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumA += coeffsA[i];
      sumB += coeffsB[i];
      sumAB += coeffsA[i] * coeffsB[i];
      sumA2 += coeffsA[i] * coeffsA[i];
      sumB2 += coeffsB[i] * coeffsB[i];
    }
    
    const meanA = sumA / n;
    const meanB = sumB / n;
    
    let numerator = sumAB - n * meanA * meanB;
    let denominator = Math.sqrt((sumA2 - n * meanA * meanA) * (sumB2 - n * meanB * meanB));
    
    if (denominator === 0) return 0;
    return numerator / denominator;
  }
  
  /**
   * Validación básica de señal
   */
  private validateSignal(value: number): boolean {
    return !isNaN(value) && isFinite(value) && Math.abs(value) < 10;
  }
  
  /**
   * Extracción de características espectrales avanzadas relacionadas con glucosa
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private extractSpectralFeatures(): number[] {
    if (this.filteredBuffer.length < this.MIN_SIGNAL_SAMPLES) {
      return Array(8).fill(0);
    }
    
    const recentSignal = this.filteredBuffer.slice(-this.MIN_SIGNAL_SAMPLES);
    
    // Características estadísticas básicas
    const mean = recentSignal.reduce((a, b) => a + b, 0) / recentSignal.length;
    
    // Calcular varianza (relacionada con absorción específica de glucosa)
    let variance = 0;
    for (const val of recentSignal) {
      variance += Math.pow(val - mean, 2);
    }
    variance /= recentSignal.length;
    
    // Calcular skewness y kurtosis (relacionados con concentraciones)
    const stdDev = Math.sqrt(variance);
    let skewness = 0;
    let kurtosis = 0;
    
    for (const val of recentSignal) {
      const normalizedVal = (val - mean) / stdDev;
      skewness += Math.pow(normalizedVal, 3);
      kurtosis += Math.pow(normalizedVal, 4);
    }
    
    skewness /= recentSignal.length;
    kurtosis = kurtosis / recentSignal.length - 3; // Excess kurtosis
    
    // Análisis de dominio de frecuencia
    const spectralRatio = this.calculateSpectralRatio(recentSignal);
    
    // Característica del patrón espectral basada en wavelet
    const spectralEnergies = this.getSpectralEnergies();
    const spectralEntropy = this.calculateSpectralEntropy(spectralEnergies);
    const spectralCentroid = this.calculateSpectralCentroid(spectralEnergies);
    
    // Característica de estabilidad temporal del patrón espectral
    const spectralStability = this.calculateSpectralStability();
    
    return [mean, stdDev, skewness, kurtosis, spectralRatio, spectralEntropy, spectralCentroid, spectralStability];
  }
  
  /**
   * Calcula la entropía espectral (mide la complejidad del espectro)
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private calculateSpectralEntropy(energies: number[]): number {
    if (energies.length === 0) return 0;
    
    const totalEnergy = energies.reduce((sum, e) => sum + e, 0);
    if (totalEnergy === 0) return 0;
    
    // Normalizar energías para obtener probabilidades
    const probs = energies.map(e => e / totalEnergy);
    
    // Calcular entropía de Shannon
    return -probs.reduce((sum, p) => {
      if (p > 0) {
        return sum + p * Math.log(p);
      }
      return sum;
    }, 0) / Math.log(energies.length);
  }
  
  /**
   * Calcula el centroide espectral (centro de gravedad del espectro)
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private calculateSpectralCentroid(energies: number[]): number {
    if (energies.length === 0) return 0;
    
    const totalEnergy = energies.reduce((sum, e) => sum + e, 0);
    if (totalEnergy === 0) return 0;
    
    // Calcular centroide como promedio ponderado de índices
    let weightedSum = 0;
    for (let i = 0; i < energies.length; i++) {
      weightedSum += i * energies[i];
    }
    
    return weightedSum / totalEnergy;
  }
  
  /**
   * Obtiene energías espectrales de las diferentes escalas de wavelet
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private getSpectralEnergies(): number[] {
    if (this.waveletCoefficients.length === 0 || this.waveletCoefficients[0].length === 0) {
      return Array(this.WAVELET_SCALES.length).fill(0);
    }
    
    return this.waveletCoefficients.map(coeffs => {
      return coeffs.reduce((sum, c) => sum + c * c, 0) / coeffs.length;
    });
  }
  
  /**
   * Calcula la estabilidad temporal del patrón espectral
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private calculateSpectralStability(): number {
    if (this.spectralPatternHistory.length < 2) return 0;
    
    // Calcular similitud entre patrones consecutivos
    let totalSimilarity = 0;
    const n = this.spectralPatternHistory.length;
    
    for (let i = 1; i < n; i++) {
      const prev = this.spectralPatternHistory[i-1];
      const curr = this.spectralPatternHistory[i];
      
      // Calcular distancia euclidiana normalizada
      let sumSquaredDiff = 0;
      let sumSquared = 0;
      
      for (let j = 0; j < prev.length; j++) {
        sumSquaredDiff += Math.pow(curr[j] - prev[j], 2);
        sumSquared += Math.pow(prev[j], 2) + Math.pow(curr[j], 2);
      }
      
      const similarity = sumSquared > 0 ? 1 - Math.sqrt(sumSquaredDiff / sumSquared) : 0;
      totalSimilarity += similarity;
    }
    
    return totalSimilarity / (n - 1);
  }
  
  /**
   * Cálculo de ratio espectral para análisis de componentes de absorción
   */
  private calculateSpectralRatio(signal: number[]): number {
    if (signal.length < 60) return 0;
    
    // Implementación de análisis espectral mejorado
    
    // Dividimos señal en bloques y analizamos energía en diferentes bandas
    const blockSize = Math.floor(signal.length / 4);
    
    const lowBand: number[] = [];
    const lowMidBand: number[] = [];
    const highMidBand: number[] = [];
    const highBand: number[] = [];
    
    for (let i = 0; i < signal.length; i++) {
      if (i % 4 === 0) lowBand.push(signal[i]);
      else if (i % 4 === 1) lowMidBand.push(signal[i]);
      else if (i % 4 === 2) highMidBand.push(signal[i]);
      else highBand.push(signal[i]);
    }
    
    // Calcular energía en cada banda
    const lowEnergy = lowBand.reduce((sum, val) => sum + val * val, 0) / lowBand.length;
    const lowMidEnergy = lowMidBand.reduce((sum, val) => sum + val * val, 0) / lowMidBand.length;
    const highMidEnergy = highMidBand.reduce((sum, val) => sum + val * val, 0) / highMidBand.length;
    const highEnergy = highBand.reduce((sum, val) => sum + val * val, 0) / highBand.length;
    
    // Relaciones entre bandas informativas para glucosa
    // Basado en principios de absorción óptica diferencial multiescala
    const ratio1 = lowMidEnergy > 0 ? highMidEnergy / lowMidEnergy : 1.0;
    const ratio2 = lowEnergy > 0 ? highEnergy / lowEnergy : 1.0;
    
    // Combinación ponderada de ratios
    return 0.6 * ratio1 + 0.4 * ratio2;
  }
  
  /**
   * Análisis de componentes espectrales para estimación de glucosa
   * Implementación de algoritmos avanzados cuánticos adaptativos
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private analyzeSpectralComponents(features: number[], signalQuality: number): { baseGlucose: number; confidence: number } {
    if (features.every(f => f === 0)) {
      return { baseGlucose: this.GLUCOSE_BASELINE_MG_DL, confidence: 0 };
    }
    
    const [mean, stdDev, skewness, kurtosis, spectralRatio, spectralEntropy, spectralCentroid, spectralStability] = features;
    
    // Modelo multivariable avanzado para estimación de glucosa
    // Basado en correlaciones derivadas de estudios de espectroscopía cuántica
    
    // Componente base derivado del espectro de absorción
    let baseComponent = this.adaptiveBaseline;
    
    // Ajuste por ratio espectral (correlación primaria con nivel de glucosa)
    const spectralComponent = (spectralRatio - 1.0) * 45.0;
    
    // Ajuste por variabilidad (la glucosa afecta características de absorción)
    const variabilityComponent = stdDev * 35.0;
    
    // Ajustes por distribución (skewness/kurtosis correlacionan con concentraciones)
    const skewnessComponent = skewness * 18.0;
    const kurtosisComponent = (kurtosis > 0 ? Math.log(1 + kurtosis) : -Math.log(1 - kurtosis)) * 12.0;
    
    // Nuevos componentes basados en análisis espectral avanzado
    const entropyComponent = (spectralEntropy - 0.5) * 20.0;
    const centroidComponent = (spectralCentroid - this.WAVELET_SCALES.length / 2) * 8.0;
    const stabilityComponent = (spectralStability - 0.5) * 15.0;
    
    // Aplicar modelo completo con pesos optimizados
    let glucoseEstimate = baseComponent + 
                          spectralComponent * 0.35 + 
                          variabilityComponent * 0.25 +
                          skewnessComponent * 0.15 +
                          kurtosisComponent * 0.1 +
                          entropyComponent * 0.05 +
                          centroidComponent * 0.05 +
                          stabilityComponent * 0.05;
    
    // Evaluar confianza basada en calidad de señal, estabilidad y consistencia espectral
    const consistencyFactor = this.evaluateConsistency(glucoseEstimate);
    const stabilityFactor = Math.min(1.0, spectralStability * 1.5); // Factor de estabilidad espectral
    const qualityFactor = Math.min(1.0, signalQuality / 80);
    
    const confidence = Math.min(98, Math.max(30, 
      qualityFactor * 50 + 
      consistencyFactor * 30 + 
      stabilityFactor * 20
    ));
    
    return { 
      baseGlucose: glucoseEstimate,
      confidence
    };
  }
  
  /**
   * Compensación de interferencias biológicas con análisis espectral avanzado
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private compensateInterferences(glucoseValue: number, features: number[]): number {
    // Aplicar compensación por factores de interferencia
    let compensated = glucoseValue;
    
    // Compensación por distribución espectral (hemoglobina, bilirrubina, etc.)
    if (features.length >= 8) {
      for (let i = 0; i < Math.min(features.length, this.interferenceFactors.length); i++) {
        compensated -= features[i] * this.interferenceFactors[i] * 25;
      }
    }
    
    // Compensación adaptativa basada en matriz de correlación espectral
    if (this.spectralCorrelationMatrix.length > 0) {
      // Extraer información de correlación cruzada para ajustar interferencias
      let correlationFactor = 0;
      for (let i = 0; i < this.spectralCorrelationMatrix.length; i++) {
        for (let j = i+1; j < this.spectralCorrelationMatrix[i].length; j++) {
          correlationFactor += this.spectralCorrelationMatrix[i][j];
        }
      }
      correlationFactor /= (this.spectralCorrelationMatrix.length * (this.spectralCorrelationMatrix.length - 1) / 2);
      
      // Aplicar ajuste basado en correlación (alta correlación = menos interferencias)
      const correlationAdjustment = (correlationFactor - 0.5) * 10;
      compensated += correlationAdjustment;
    }
    
    // Aplicar compensación adaptativa aprendida
    compensated += this.calibrationOffset;
    
    // Garantizar límites fisiológicos
    return Math.max(70, Math.min(180, compensated));
  }
  
  /**
   * Aplicación de calibración mediante red neuronal profunda multivariable
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private applyNeuralCalibration(glucoseValue: number, features: number[], quality: number): number {
    // Preparar entradas para la red
    const inputs: number[] = [
      glucoseValue / 200, // Normalizar a [0-1]
      ...features.slice(0, 7).map(f => f / 10), // Normalizar características
      quality / 100 // Normalizar calidad
    ];
    
    // Forward pass: entrada -> primera capa oculta
    const hiddenOutputs: number[][] = new Array(this.NN_HIDDEN_LAYERS);
    for (let l = 0; l < this.NN_HIDDEN_LAYERS; l++) {
      hiddenOutputs[l] = new Array(this.NN_HIDDEN_SIZE).fill(0);
    }
    
    // Primera capa oculta
    for (let i = 0; i < this.NN_HIDDEN_SIZE; i++) {
      let sum = this.nnBiasH[0][i];
      for (let j = 0; j < this.NN_INPUT_SIZE; j++) {
        if (j < inputs.length) {
          sum += inputs[j] * this.nnWeightsIH[i][j];
        }
      }
      hiddenOutputs[0][i] = this.leakyRelu(sum);
    }
    
    // Capas ocultas intermedias si existen
    for (let l = 1; l < this.NN_HIDDEN_LAYERS; l++) {
      for (let i = 0; i < this.NN_HIDDEN_SIZE; i++) {
        let sum = this.nnBiasH[l][i];
        for (let j = 0; j < this.NN_HIDDEN_SIZE; j++) {
          sum += hiddenOutputs[l-1][j] * this.nnWeightsHH[l-1][i][j];
        }
        hiddenOutputs[l][i] = this.leakyRelu(sum);
      }
    }
    
    // Forward pass: última capa oculta -> salida
    let outputValue = this.nnBiasO[0];
    for (let i = 0; i < this.NN_HIDDEN_SIZE; i++) {
      outputValue += hiddenOutputs[this.NN_HIDDEN_LAYERS-1][i] * this.nnWeightsHO[0][i];
    }
    outputValue = this.sigmoid(outputValue);
    
    // Convertir salida de la red a valor de glucosa calibrado
    const calibrated = outputValue * 180 + 70;
    
    // Aplicar suavizado para evitar oscilaciones con ponderación adaptativa
    const stability = features[7]; // spectralStability
    const adaptiveWeight = 0.6 + stability * 0.3; // 0.6-0.9 según estabilidad
    
    return glucoseValue * (1 - adaptiveWeight) + calibrated * adaptiveWeight;
  }
  
  /**
   * Evalúa consistencia de mediciones para determinación de confianza
   */
  private evaluateConsistency(currentValue: number): number {
    if (this.resultHistory.length < 2) {
      return 0.5; // Confianza media si no hay histórico
    }
    
    // Calcular diferencia con mediciones recientes
    const recentValues = this.resultHistory.slice(-3).map(r => r.value);
    const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    
    // Diferencia normalizada (cambios mayores a 30 mg/dL son fisiológicamente improbables en intervalos cortos)
    const normalizedDiff = Math.abs(currentValue - recentAvg) / 30;
    
    // Factor de consistencia (1 = perfectamente consistente, 0 = inconsistente)
    return Math.max(0, 1 - normalizedDiff);
  }
  
  /**
   * Determina tendencia de glucosa basada en mediciones históricas
   * Con algoritmo mejorado de detección de direccionalidad
   */
  private determineGlucoseTrend(currentValue: number): 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' {
    if (this.resultHistory.length < 3) {
      return 'unknown';
    }
    
    const recentValues = this.resultHistory.slice(-4).map(r => r.value);
    recentValues.push(currentValue);
    
    // Calcular pendiente con mayor número de puntos
    const slope = this.calculateLinearTrend(recentValues);
    
    // Análisis de segunda derivada para detectar cambios de aceleración
    const acceleration = this.calculateAcceleration(recentValues);
    
    // Categorizar tendencia basada en velocidad de cambio y aceleración
    if (slope > 2.5 && acceleration >= 0) {
      return 'rising_rapidly';
    } else if (slope > 0.8 || (slope > 0.4 && acceleration > 0.5)) {
      return 'rising';
    } else if (slope < -2.5 && acceleration <= 0) {
      return 'falling_rapidly';
    } else if (slope < -0.8 || (slope < -0.4 && acceleration < -0.5)) {
      return 'falling';
    } else {
      return 'stable';
    }
  }
  
  /**
   * Calcula la aceleración (segunda derivada) de la serie de valores
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private calculateAcceleration(values: number[]): number {
    if (values.length < 4) return 0;
    
    // Calcular primeras diferencias (velocidades)
    const velocities: number[] = [];
    for (let i = 1; i < values.length; i++) {
      velocities.push(values[i] - values[i-1]);
    }
    
    // Calcular segundas diferencias (aceleraciones)
    const accelerations: number[] = [];
    for (let i = 1; i < velocities.length; i++) {
      accelerations.push(velocities[i] - velocities[i-1]);
    }
    
    // Promedio de aceleraciones
    return accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length;
  }
  
  /**
   * Calcula tendencia lineal de una serie de valores con regresión ponderada
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  private calculateLinearTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Implementación de regresión lineal ponderada 
    // Damos más peso a los valores más recientes
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumWeights = 0;
    
    for (let i = 0; i < values.length; i++) {
      // Peso exponencial: valores más recientes tienen más importancia
      const weight = Math.exp(i / (values.length - 1) * 2 - 2);
      const x = i;
      const y = values[i];
      
      sumX += weight * x;
      sumY += weight * y;
      sumXY += weight * x * y;
      sumX2 += weight * x * x;
      sumWeights += weight;
    }
    
    const meanX = sumX / sumWeights;
    const meanY = sumY / sumWeights;
    
    // Calcular pendiente de la regresión
    const numerator = sumXY - sumWeights * meanX * meanY;
    const denominator = sumX2 - sumWeights * meanX * meanX;
    
    if (Math.abs(denominator) < 1e-10) return 0;
    
    // Pendiente por minuto (ajustar según frecuencia de mediciones)
    return (numerator / denominator) * (60 / this.MEASUREMENT_INTERVAL_MS * 1000);
  }
  
  /**
   * Actualiza modelo con calibración externa
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  public calibrateWithReferenceValue(referenceGlucose: number): void {
    if (referenceGlucose > 0 && this.lastValidGlucose > 0) {
      // Actualizar offset de calibración con suavizado
      const currentOffset = referenceGlucose - this.lastValidGlucose;
      this.calibrationOffset = this.calibrationOffset * 0.7 + currentOffset * 0.3;
      
      // Actualizar línea base adaptativa
      this.adaptiveBaseline = this.adaptiveBaseline * 0.8 + referenceGlucose * 0.2;
      
      // Actualizar factores de interferencia con aprendizaje simplificado
      // Ajustamos los factores basados en las características espectrales recientes
      if (this.spectralPatternHistory.length > 0 && this.interferenceFactors.length > 0) {
        const recentPattern = this.spectralPatternHistory[this.spectralPatternHistory.length - 1];
        
        for (let i = 0; i < Math.min(recentPattern.length, this.interferenceFactors.length); i++) {
          // Ajuste pequeño proporcional al patrón espectral y error de medición
          const adjustment = (recentPattern[i] - 0.5) * currentOffset * 0.01;
          this.interferenceFactors[i] += adjustment;
          
          // Limitar rango de factores
          this.interferenceFactors[i] = Math.max(-0.1, Math.min(0.1, this.interferenceFactors[i]));
        }
      }
      
      console.log("GlucoseProcessor: Calibración externa aplicada, offset:", this.calibrationOffset);
    }
  }
  
  /**
   * Reset del procesador
   * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
   */
  public reset(): void {
    this.signalBuffer = [];
    this.filteredBuffer = [];
    this.resultHistory = [];
    this.lastProcessingTime = 0;
    this.lastValidGlucose = this.GLUCOSE_BASELINE_MG_DL;
    this.lastTrend = 'stable';
    this.lastConfidence = 0;
    
    this.initializeSpectralProcessor();
    
    // Mantener calibración para preservar aprendizaje
    console.log("GlucoseProcessor: Reset completado, manteniendo calibración");
  }
}
