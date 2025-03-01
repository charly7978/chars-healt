import { calculateStandardDeviation, enhancedPeakDetection } from '../utils/signalProcessingUtils';

export class BloodPressureCalculator {
  // Constantes para análisis de onda PPG
  private readonly MIN_SAMPLES = 50; // Mínimo de muestras para análisis confiable
  private readonly QUALITY_THRESHOLD = 0.6; // Umbral de calidad de señal
  private readonly PTT_WINDOW = 10; // Ventana para análisis de tiempo de tránsito de pulso
  
  // Variables de estado para análisis continuo
  private lastValidSystolic: number = 0;
  private lastValidDiastolic: number = 0;
  private signalQualityHistory: number[] = [];
  private pttHistory: number[] = [];
  private amplitudeHistory: number[] = [];
  private augmentationIndexHistory: number[] = [];
  
  /**
   * Calcula características morfológicas de la onda PPG
   */
  private analyzePPGWaveform(values: number[], peakIndices: number[], valleyIndices: number[]) {
    const features = {
      ptt: 0,
      amplitude: 0,
      augmentationIndex: 0,
      quality: 0
    };

    try {
      // Extraer pulsos individuales
      const pulses: number[][] = [];
      for (let i = 0; i < peakIndices.length - 1; i++) {
        const start = peakIndices[i];
        const end = peakIndices[i + 1];
        if (end - start >= 10 && end - start <= 60) {
          const pulse = values.slice(start, end);
          pulses.push(pulse);
        }
      }

      if (pulses.length < 3) {
        return null;
      }

      // Analizar cada pulso
      const pulseFeatures = pulses.map(pulse => {
        // Normalizar pulso
        const normalized = this.normalizePulse(pulse);
        
        // Encontrar características clave
        const firstPeak = this.findFirstPeak(normalized);
        const dicroticNotch = this.findDicroticNotch(normalized, firstPeak);
        const secondPeak = this.findSecondPeak(normalized, dicroticNotch);
        
        // Calcular PTT
        const ptt = this.calculatePTT(normalized, firstPeak);
        
        // Calcular amplitud
        const amplitude = Math.max(...pulse) - Math.min(...pulse);
        
        // Calcular índice de aumentación
        const augmentationIndex = secondPeak ? 
          (normalized[secondPeak] - normalized[dicroticNotch]) / 
          (normalized[firstPeak] - normalized[0]) : 0;

        return { ptt, amplitude, augmentationIndex };
      });

      // Promediar características
      features.ptt = this.getMedian(pulseFeatures.map(f => f.ptt));
      features.amplitude = this.getMedian(pulseFeatures.map(f => f.amplitude));
      features.augmentationIndex = this.getMedian(pulseFeatures.map(f => f.augmentationIndex));
      
      // Calcular calidad de señal
      features.quality = this.calculateSignalQuality(pulseFeatures);

      return features;
    } catch (error) {
      console.error('Error en análisis de forma de onda:', error);
      return null;
    }
  }

  /**
   * Normaliza un pulso PPG
   */
  private normalizePulse(pulse: number[]): number[] {
    const min = Math.min(...pulse);
    const max = Math.max(...pulse);
    const range = max - min;
    return pulse.map(v => (v - min) / range);
  }

  /**
   * Encuentra el primer pico sistólico
   */
  private findFirstPeak(normalized: number[]): number {
    let maxIndex = 0;
    for (let i = 1; i < normalized.length / 2; i++) {
      if (normalized[i] > normalized[maxIndex]) {
        maxIndex = i;
      }
    }
    return maxIndex;
  }

  /**
   * Encuentra la muesca dicrótica
   */
  private findDicroticNotch(normalized: number[], firstPeak: number): number {
    let minIndex = firstPeak;
    for (let i = firstPeak + 1; i < normalized.length * 0.8; i++) {
      if (normalized[i] < normalized[minIndex]) {
        minIndex = i;
      }
    }
    return minIndex;
  }

  /**
   * Encuentra el segundo pico (onda reflejada)
   */
  private findSecondPeak(normalized: number[], dicroticNotch: number): number | null {
    let maxIndex = dicroticNotch;
    let found = false;
    
    for (let i = dicroticNotch + 1; i < normalized.length; i++) {
      if (normalized[i] > normalized[maxIndex]) {
        maxIndex = i;
        found = true;
      }
    }
    
    return found ? maxIndex : null;
  }

  /**
   * Calcula el PTT (Pulse Transit Time)
   */
  private calculatePTT(normalized: number[], firstPeak: number): number {
    let maxSlope = 0;
    let maxSlopeIndex = 0;
    
    for (let i = 1; i < firstPeak; i++) {
      const slope = normalized[i] - normalized[i-1];
      if (slope > maxSlope) {
        maxSlope = slope;
        maxSlopeIndex = i;
      }
    }
    
    return maxSlopeIndex;
  }

  /**
   * Calcula la calidad de la señal
   */
  private calculateSignalQuality(features: Array<{ ptt: number, amplitude: number, augmentationIndex: number }>): number {
    const pttVariation = this.calculateVariation(features.map(f => f.ptt));
    const ampVariation = this.calculateVariation(features.map(f => f.amplitude));
    
    // Una señal de calidad tiene baja variación en PTT y amplitud
    return Math.max(0, 1 - (pttVariation + ampVariation) / 2);
  }

  /**
   * Calcula la variación de un conjunto de valores
   */
  private calculateVariation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / mean;
  }

  /**
   * Obtiene la mediana de un conjunto de valores
   */
  private getMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Calcula la presión arterial basada en el análisis de la onda PPG
   */
  calculate(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    if (values.length < this.MIN_SAMPLES) {
      return { systolic: 0, diastolic: 0 };
    }

    try {
      const { peakIndices, valleyIndices } = enhancedPeakDetection(values);
      
      if (peakIndices.length < 5 || valleyIndices.length < 5) {
        return { systolic: 0, diastolic: 0 };
      }

      const features = this.analyzePPGWaveform(values, peakIndices, valleyIndices);
      
      if (!features || features.quality < this.QUALITY_THRESHOLD) {
        return { systolic: 0, diastolic: 0 };
      }

      // Actualizar historiales
      this.pttHistory.push(features.ptt);
      this.amplitudeHistory.push(features.amplitude);
      this.augmentationIndexHistory.push(features.augmentationIndex);
      this.signalQualityHistory.push(features.quality);
      
      // Mantener historiales acotados
      if (this.pttHistory.length > this.PTT_WINDOW) {
        this.pttHistory.shift();
        this.amplitudeHistory.shift();
        this.augmentationIndexHistory.shift();
        this.signalQualityHistory.shift();
      }

      // Calcular presión basada en características de la onda
      const ptt = this.getMedian(this.pttHistory);
      const amplitude = this.getMedian(this.amplitudeHistory);
      const augmentationIndex = this.getMedian(this.augmentationIndexHistory);
      
      // Fórmulas basadas en investigación de PPG para estimación de presión
      let systolic = Math.round(
        -0.5 * ptt + 
        30 * augmentationIndex + 
        0.3 * amplitude + 
        90
      );
      
      let diastolic = Math.round(
        -0.3 * ptt + 
        15 * augmentationIndex + 
        0.2 * amplitude + 
        60
      );

      // Validar resultados
      if (systolic >= 90 && systolic <= 180 && 
          diastolic >= 50 && diastolic <= 110 && 
          systolic > diastolic && 
          systolic - diastolic >= 30 && 
          systolic - diastolic <= 60) {
        
        this.lastValidSystolic = systolic;
        this.lastValidDiastolic = diastolic;
        return { systolic, diastolic };
      }

      return { systolic: 0, diastolic: 0 };

    } catch (error) {
      console.error('Error en cálculo de presión arterial:', error);
      return { systolic: 0, diastolic: 0 };
    }
  }

  /**
   * Obtiene la última presión válida
   */
  public getLastValidPressure(): string {
    if (this.lastValidSystolic <= 0 || this.lastValidDiastolic <= 0) {
      return "0/0";
    }
    return `${this.lastValidSystolic}/${this.lastValidDiastolic}`;
  }

  /**
   * Reinicia el calculador
   */
  reset(): void {
    this.lastValidSystolic = 0;
    this.lastValidDiastolic = 0;
    this.signalQualityHistory = [];
    this.pttHistory = [];
    this.amplitudeHistory = [];
    this.augmentationIndexHistory = [];
  }
}
