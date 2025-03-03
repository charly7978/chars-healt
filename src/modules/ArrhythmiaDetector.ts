
/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias simplificado para la aplicación CharsHealt
 */

export class ArrhythmiaDetector {
  private readonly LEARNING_PERIOD = 2800;
  private arrhythmiaCount = 0;
  private hasDetectedArrhythmia = false;
  private measurementStartTime: number = Date.now();
  private lastRMSSD: number = 0;
  private lastRRVariation: number = 0;
  private lastArrhythmiaTime: number = 0;
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private peakTimes: number[] = [];
  private isLearningPhase = true;
  private lastPeakTime: number | null = null;
  private baseRRInterval: number = 0;
  private avgNormalAmplitude: number = 0;
  private readonly PREMATURE_BEAT_THRESHOLD = 0.7; // Factor para detectar latidos prematuros
  private readonly ARRHYTHMIA_RR_THRESHOLD = 0.3; // Variación de RR para detectar arritmias
  private readonly MIN_DETECTION_CONFIDENCE = 0.65; // Confianza mínima para una detección
  
  /**
   * Reset all state variables
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.isLearningPhase = true;
    this.hasDetectedArrhythmia = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
  
  /**
   * Check if in learning phase
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.LEARNING_PERIOD;
  }
  
  /**
   * Update learning phase status
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.LEARNING_PERIOD) {
        this.isLearningPhase = false;
        
        // Calculate base values after learning phase
        if (this.amplitudes.length > 5) {
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          const normalCount = Math.max(3, Math.ceil(sortedAmplitudes.length * 0.33));
          const topAmplitudes = sortedAmplitudes.slice(0, normalCount);
          this.avgNormalAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
        }
        
        // Calcular intervalo RR normal de referencia
        if (this.rrIntervals.length > 5) {
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          const cutSize = Math.max(1, Math.floor(sortedRR.length * 0.1));
          const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
          const medianIndex = Math.floor(filteredRR.length / 2);
          this.baseRRInterval = filteredRR[medianIndex];
        }
      }
    }
  }
  
  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Check if we have any data to process
    if (!intervals || intervals.length === 0) {
      return;
    }
    
    this.rrIntervals = intervals;
    this.lastPeakTime = lastPeakTime;
    
    // NUEVO: Registrar el tiempo del pico actual
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      // Mantener solo los últimos 10 tiempos
      if (this.peakTimes.length > 10) {
        this.peakTimes.shift();
      }
    }
    
    // Store peak amplitude if provided
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(Math.abs(peakAmplitude));
      
      // Keep the same number of amplitudes as intervals
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * Detector de arritmias mejorado que busca latidos prematuros
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // Skip detection during learning phase or if not enough data
    if (this.rrIntervals.length < 3 || this.amplitudes.length < 3 || this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Calcular RMSSD (Root Mean Square of Successive Differences)
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    // Calcular variación RR para información adicional
    const lastInterval = this.rrIntervals[this.rrIntervals.length - 1];
    const rrVariation = (this.baseRRInterval > 0) ? 
      Math.abs(lastInterval - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // Detección de latidos prematuros
    let prematureBeat = false;
    let confidenceScore = 0;
    let detectedArrhythmia = false;
    
    if (this.rrIntervals.length >= 3 && this.baseRRInterval > 0) {
      // Verificar la secuencia de los últimos intervalos
      const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
      const previousRR = this.rrIntervals[this.rrIntervals.length - 2];
      
      // Patrón de latido prematuro: un intervalo significativamente más corto
      // seguido por un intervalo compensatorio más largo
      if (lastRR < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD) {
        prematureBeat = true;
        confidenceScore = 0.85;
        detectedArrhythmia = true;
      }
      // También verificar variabilidad excesiva
      else if (rrVariation > this.ARRHYTHMIA_RR_THRESHOLD) {
        confidenceScore = Math.min(rrVariation * 2, 0.95);
        detectedArrhythmia = confidenceScore > this.MIN_DETECTION_CONFIDENCE;
      }
    }
    
    // Verificar también patrones en amplitudes si están disponibles
    if (this.amplitudes.length >= 3 && this.avgNormalAmplitude > 0) {
      const lastAmp = this.amplitudes[this.amplitudes.length - 1];
      const ampVariation = Math.abs(lastAmp - this.avgNormalAmplitude) / this.avgNormalAmplitude;
      
      // Las arritmias a menudo tienen amplitudes anormales
      if (ampVariation > 0.4) {
        confidenceScore = Math.max(confidenceScore, ampVariation * 0.8);
        if (confidenceScore > this.MIN_DETECTION_CONFIDENCE) {
          detectedArrhythmia = true;
        }
      }
    }
    
    // Actualizar estado de detección
    if (detectedArrhythmia) {
      const now = Date.now();
      if (now - this.lastArrhythmiaTime > 1000) { // Evitar múltiples conteos en poco tiempo
        this.arrhythmiaCount++;
        this.lastArrhythmiaTime = now;
      }
      this.hasDetectedArrhythmia = true;
    }
    
    return {
      detected: detectedArrhythmia,
      count: this.arrhythmiaCount,
      status: this.hasDetectedArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd, 
        rrVariation, 
        prematureBeat,
        confidence: confidenceScore
      }
    };
  }

  /**
   * Get current arrhythmia status
   */
  getStatus(): string {
    return this.hasDetectedArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Get current arrhythmia count
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Clean memory function for resource management
   */
  cleanMemory(): void {
    this.reset();
  }
}
