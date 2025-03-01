/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Parámetros de configuración optimizados para detección precisa
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 2000; // Reducido a 2 segundos para entrar antes en detección
  
  // Umbrales óptimos basados en literatura médica
  private readonly PREMATURE_BEAT_THRESHOLD = 0.65;
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.85; // Aumentado de 0.82 para capturar más picos pequeños 
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.60; // Reducido de 0.65 para clasificar más picos como normales
  
  // Variables de estado
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; 
  private peakTimes: number[] = []; 
  private isLearningPhase = true;
  private hasDetectedFirstArrhythmia = false;
  private arrhythmiaDetected = false;
  private measurementStartTime: number = Date.now();
  private arrhythmiaCount = 0;
  private lastRMSSD: number = 0;
  private lastRRVariation: number = 0;
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;
  private avgNormalAmplitude: number = 0;
  private baseRRInterval: number = 0;
  
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
  }> = [];
  
  /**
   * Reset all state variables
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.peakSequence = [];
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
  
  /**
   * Update learning phase status - optimizada para adaptarse mejor a la señal del paciente
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
        
        // Calculate base values after learning phase
        if (this.amplitudes.length > 5) {
          // Filtrado avanzado optimizado para señales PPG
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          
          // Eliminación de valores atípicos mediante método estadístico
          const cutSize = Math.max(1, Math.floor(sortedAmplitudes.length * 0.1));
          const filteredAmplitudes = sortedAmplitudes.slice(cutSize, sortedAmplitudes.length - cutSize);
          
          // Cálculo de amplitud normal mediante ventana de mediana
          const medianIndex = Math.floor(filteredAmplitudes.length / 2);
          const medianWindow = filteredAmplitudes.slice(
            Math.max(0, medianIndex - 2), 
            Math.min(filteredAmplitudes.length, medianIndex + 3)
          );
          
          // Promedio recortado
          this.avgNormalAmplitude = medianWindow.reduce((a, b) => a + b, 0) / medianWindow.length;
          
          console.log('ArrhythmiaDetector - Amplitud normal de referencia calibrada:', this.avgNormalAmplitude);
        }
        
        // Calculate normal RR interval
        if (this.rrIntervals.length > 5) {
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // Eliminación de valores extremos
          const cutSize = Math.max(1, Math.floor(sortedRR.length * 0.15));
          const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
          
          // Uso de mediana como valor de referencia para mayor estabilidad
          const medianIndex = Math.floor(filteredRR.length / 2);
          this.baseRRInterval = filteredRR[medianIndex];
          
          console.log('ArrhythmiaDetector - Intervalo RR normal calibrado:', this.baseRRInterval);
        }
      }
    }
  }

  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    if (!intervals || intervals.length === 0) return;

    const currentTime = Date.now();
    this.rrIntervals = intervals;
    this.lastPeakTime = lastPeakTime;
    
    // LOG: Depuración para visualizar datos que llegan
    console.log('ArrhythmiaDetector - Recibiendo datos:', {
      peakAmplitude: peakAmplitude ? Math.abs(peakAmplitude).toFixed(2) : 'N/A',
      avgNormalAmplitude: this.avgNormalAmplitude.toFixed(2),
      isLearning: this.isLearningPhase,
      timestamp: new Date().toISOString()
    });
    
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      if (this.peakTimes.length > 10) {
        this.peakTimes.shift();
      }
    }
    
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(Math.abs(peakAmplitude));
      
      if (lastPeakTime) {
        let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
        
        if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
          const ratio = Math.abs(peakAmplitude) / this.avgNormalAmplitude;
          
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            peakType = 'normal';
          } 
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
            peakType = 'premature';
          }
        }
        
        this.peakSequence.push({
          amplitude: Math.abs(peakAmplitude),
          time: currentTime,
          type: peakType
        });
        
        if (this.peakSequence.length > 10) {
          this.peakSequence.shift();
        }
      }
      
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * Algoritmo optimizado para detección precisa de latidos prematuros (extrasístoles)
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; timestamp: number } | null;
  } {
    // Fase de calibración - no detectar arritmias hasta tener suficientes datos
    if (this.rrIntervals.length < 3 || this.amplitudes.length < 3) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // No detectar arritmias durante calibración
    if (this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `CALIBRANDO|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Cálculo de RMSSD (indicador de variabilidad cardíaca)
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    let prematureBeatDetected = false;
    
    // Análisis de patrones de latidos
    if (this.peakSequence.length >= 3 && this.avgNormalAmplitude > 0) {
      // Analizar las últimas secuencias para mayor precisión
      const seqsToCheck = Math.min(this.peakSequence.length - 2, 3);
      
      for (let offset = 0; offset < seqsToCheck && !prematureBeatDetected; offset++) {
        const startIdx = this.peakSequence.length - 3 - offset;
        if (startIdx < 0) break;
        
        const threeBeats = this.peakSequence.slice(startIdx, startIdx + 3);
        if (threeBeats.length !== 3) continue;
      
        // Clasificación de latidos según amplitud
        for (let i = 0; i < threeBeats.length; i++) {
          const peak = threeBeats[i];
          const ratio = peak.amplitude / this.avgNormalAmplitude;
          
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            threeBeats[i].type = 'normal';
          } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
            threeBeats[i].type = 'premature';
          } else {
            threeBeats[i].type = 'unknown';
          }
        }
        
        // Patrón clásico de extrasístole: normal-prematuro-normal
        if (
          threeBeats[0].type === 'normal' && 
          threeBeats[1].type === 'premature' && 
          threeBeats[2].type === 'normal'
        ) {
          // Análisis de patrones temporales (intervalos RR)
          let intervalPatternValid = false;
          
          if (this.baseRRInterval > 0) {
            // Calcular intervalos entre latidos
            const interval1 = threeBeats[1].time - threeBeats[0].time;
            const interval2 = threeBeats[2].time - threeBeats[1].time;
            
            // Normalizar por el intervalo base
            const interval1Ratio = interval1 / this.baseRRInterval;
            const interval2Ratio = interval2 / this.baseRRInterval;
            
            // Patrón clásico de extrasístole: primer intervalo corto, segundo largo
            intervalPatternValid = interval1Ratio < 0.90 && interval2Ratio > 1.10;
          }
          
          // Verificación del patrón de amplitud
          const firstPeakRatio = threeBeats[0].amplitude / this.avgNormalAmplitude;
          const secondPeakRatio = threeBeats[1].amplitude / this.avgNormalAmplitude;
          const thirdPeakRatio = threeBeats[2].amplitude / this.avgNormalAmplitude;
          
          const amplitudePatternValid = 
            secondPeakRatio <= this.AMPLITUDE_RATIO_THRESHOLD && 
            firstPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD * 0.9 && 
            thirdPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD * 0.9;
          
          // Detectar como arritmia si se cumplen criterios de amplitud O intervalos
          // Esto permite mayor sensibilidad para detectar arritmias reales
          prematureBeatDetected = amplitudePatternValid || intervalPatternValid;
        }
      }
    }
    
    // Cálculo de variabilidad RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // Contabilizar arritmias evitando repeticiones (debounce)
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 500) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      console.log('ArrhythmiaDetector - Arritmia detectada:', {
        count: this.arrhythmiaCount,
        timestamp: currentTime
      });
    }

    this.arrhythmiaDetected = prematureBeatDetected;

    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd, 
        rrVariation, 
        prematureBeat: prematureBeatDetected,
        timestamp: currentTime
      }
    };
  }

  // Métodos auxiliares
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD;
  }

  getStatus(): string {
    return this.hasDetectedFirstArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  cleanMemory(): void {
    this.reset();
  }
}
