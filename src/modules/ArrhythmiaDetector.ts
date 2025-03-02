/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 7;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 4000; // Reducido a 4 segundos para detección más temprana
  // Umbrales ajustados para mayor sensibilidad
  private readonly PREMATURE_BEAT_THRESHOLD = 0.75; // Valor más permisivo para detectar más latidos prematuros
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.55; // Más permisivo para detectar cambios menores en amplitud
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.85; // Reducido para considerar más latidos como normales
  // Nuevos parámetros para mejorar la detección
  private readonly MIN_PREMATURE_INTERVAL_MS = 450; // Más permisivo para detectar más rápido
  private readonly PATTERN_VALIDATION_WINDOW = 4; // Ventana más pequeña para validar patrones
  private readonly POST_PREMATURE_COMPENSATION_MS = 300; // Compensación después de latido prematuro
  private readonly MIN_AMPLITUDE_FOR_DETECTION = 0.02; // Amplitud mínima para considerar una detección válida
  private readonly RMSSD_THRESHOLD = 30; // Umbral RMSSD que sugiere arritmia
  private readonly RR_VARIATION_THRESHOLD = 0.12; // Umbral de variación RR que sugiere arritmia
  
  // State variables
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Store amplitudes to detect small beats
  private peakTimes: number[] = []; // Almacenar los tiempos exactos de cada pico
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
  private baseRRInterval: number = 0; // Average normal RR interval
  // Nuevas variables para el análisis contextual
  private recentRRHistory: number[] = []; // Últimos intervalos RR para análisis de patrón
  private normalizedRRPattern: number[] = []; // Patrón normalizado de intervalos RR
  private lastPrematureTime: number = 0; // Último momento de latido prematuro confirmado
  private lastFalsePositiveTime: number = 0; // Para evitar falsos positivos repetidos
  
  // NUEVO: Almacenamiento de secuencia de picos para análisis preciso
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
  }> = [];
  
  // DEBUG flag to track detection issues
  private readonly DEBUG_MODE = true;
  
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
    this.recentRRHistory = [];
    this.normalizedRRPattern = [];
    this.lastPrematureTime = 0;
    this.lastFalsePositiveTime = 0;
    
    console.log("ArrhythmiaDetector: Reset completo");
  }
  
  /**
   * Check if in learning phase
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD;
  }

  /**
   * Update learning phase status and calculate baseline values
   */
  updateLearningPhase(): void {
    const currentTime = Date.now();
    const timeSinceStart = currentTime - this.measurementStartTime;
    
    // Check if we should end learning phase
    if (this.isLearningPhase && timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      
      // Calculate baseline values from learning phase data
      if (this.rrIntervals.length >= 3) {
        // Exclude outliers for baseRRInterval calculation
        const sortedIntervals = [...this.rrIntervals].sort((a, b) => a - b);
        const lowerQuartileIndex = Math.floor(sortedIntervals.length * 0.25);
        const upperQuartileIndex = Math.ceil(sortedIntervals.length * 0.75);
        const normalIntervals = sortedIntervals.slice(lowerQuartileIndex, upperQuartileIndex + 1);
        
        this.baseRRInterval = normalIntervals.reduce((sum, val) => sum + val, 0) / normalIntervals.length;
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Fin fase aprendizaje:', {
            baseRRInterval: this.baseRRInterval,
            baseBPM: Math.round(60000 / this.baseRRInterval)
          });
        }
      }
      
      // Calculate average normal amplitude (top 50% of amplitudes)
      if (this.amplitudes.length >= 3) {
        const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a); // Descendente
        const medianIndex = Math.floor(sortedAmplitudes.length / 2);
        const normalAmplitudes = sortedAmplitudes.slice(0, medianIndex + 1);
        this.avgNormalAmplitude = normalAmplitudes.reduce((sum, val) => sum + val, 0) / normalAmplitudes.length;
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Amplitud normal calculada:', {
            avgNormalAmplitude: this.avgNormalAmplitude,
            numSamples: normalAmplitudes.length
          });
        }
      }
    }
  }
  
  /**
   * Método para acceder al tiempo de inicio de la medición
   */
  getStartTime(): number {
    return this.measurementStartTime;
  }
  
  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Check if we have any data to process
    if (!intervals || intervals.length === 0) {
      return;
    }
    
    const currentTime = Date.now();
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
      
      // Actualizar la secuencia de picos con el nuevo
      if (lastPeakTime) {
        // Clasificación inicial como desconocido
        let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
        
        // Si ya tenemos amplitud de referencia, podemos hacer una clasificación inicial
        if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
          const ratio = Math.abs(peakAmplitude) / this.avgNormalAmplitude;
          
          // Clasificar como normal si está cerca o por encima del promedio normal
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            peakType = 'normal';
          } 
          // Clasificar como prematuro si es significativamente más pequeño
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
            peakType = 'premature';
          }
        }
        
        this.peakSequence.push({
          amplitude: Math.abs(peakAmplitude),
          time: currentTime,
          type: peakType
        });
        
        // Mantener solo los últimos 10 picos
        if (this.peakSequence.length > 10) {
          this.peakSequence.shift();
        }
      }
      
      // Keep the same number of amplitudes as intervals
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    // Procesar el intervalo más reciente si existe
    if (intervals.length > 0) {
      const currentInterval = intervals[0];
      
      // Actualizar historial de RR para análisis contextual
      this.recentRRHistory.unshift(currentInterval);
      if (this.recentRRHistory.length > this.PATTERN_VALIDATION_WINDOW) {
        this.recentRRHistory.pop();
      }
      
      // Actualizar patrón normalizado solo si tenemos suficientes datos
      if (this.baseRRInterval > 0 && this.recentRRHistory.length >= 3) {
        this.normalizedRRPattern = this.recentRRHistory.map(interval => 
          interval / this.baseRRInterval);
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * ALGORITMO MEJORADO: Detecta SOLO latidos prematuros PEQUEÑOS entre dos latidos NORMALES
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Skip detection during learning phase or if not enough data
    if (this.rrIntervals.length < 3 || this.amplitudes.length < 3 || this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calculate RMSSD for reference
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    // Mejora del algoritmo de detección de latidos prematuros usando análisis de patrón
    if (this.peakSequence.length >= 3 && this.normalizedRRPattern.length >= 2) {
      const checkPrematureBeat = () => {
        const currentTime = Date.now();
        
        // Obtener los dos últimos intervalos normalizados
        const lastNormalizedRR = this.normalizedRRPattern[0];
        const prevNormalizedRR = this.normalizedRRPattern.length > 1 ? this.normalizedRRPattern[1] : 1.0;
        
        // Obtener amplitudes para comparación contextual
        const lastPeaks = this.peakSequence.slice(-3);
        
        // Criterio simplificado basado en investigaciones médicas:
        // 1. Un intervalo significativamente más corto que el normal (prematuro)
        const isRRIntervalShort = lastNormalizedRR < this.PREMATURE_BEAT_THRESHOLD; 
        
        // 2. El intervalo anterior debe ser relativamente normal
        const isPreviousIntervalNormal = prevNormalizedRR > 0.85;
        
        // 3. Validación simple: Debe haber un cambio significativo en RR
        const hasSignificantVariation = this.lastRRVariation > this.RR_VARIATION_THRESHOLD || rmssd > this.RMSSD_THRESHOLD;
        
        // Evitar detecciones muy cercanas en tiempo
        const timeSinceLastPremature = currentTime - this.lastPrematureTime;
        const sufficientTimePassed = timeSinceLastPremature > 1200; // Al menos 1.2 segundos entre detecciones
        
        // Algoritmo principal - más permisivo para detectar arritmias
        const isPrematureBeat = 
          isRRIntervalShort && 
          isPreviousIntervalNormal && 
          (hasSignificantVariation || this.lastRRVariation > 0.1) &&
          sufficientTimePassed;
        
        if (isPrematureBeat) {
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - POSIBLE LATIDO PREMATURO DETECTADO:', {
              lastNormalizedRR,
              prevNormalizedRR,
              rmssd,
              rrVariation: this.lastRRVariation,
              amplitudeRatio: lastPeaks.length > 1 
                ? lastPeaks[lastPeaks.length-1].amplitude / lastPeaks[lastPeaks.length-2].amplitude 
                : 0
            });
          }
          
          this.lastPrematureTime = currentTime;
          return true;
        }
        
        return false;
      };
      
      // Aplicar detección
      const isPrematureBeat = checkPrematureBeat();
      
      // Actualizar estado basado en resultado
      if (isPrematureBeat && !this.arrhythmiaDetected) {
        this.arrhythmiaDetected = true;
        this.arrhythmiaCount++;
        this.hasDetectedFirstArrhythmia = true;
        this.lastArrhythmiaTime = currentTime;
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - NUEVA ARRITMIA DETECTADA:', {
            count: this.arrhythmiaCount,
            timestamp: currentTime,
            normalizedRR: this.normalizedRRPattern.slice(0, 3)
          });
        }
      } else if (!isPrematureBeat && this.arrhythmiaDetected) {
        // Mantener el estado de arritmia por un breve periodo para estabilidad visual
        const timeSinceLastArrhythmia = currentTime - this.lastArrhythmiaTime;
        if (timeSinceLastArrhythmia > 1000) { // 1 segundo
          this.arrhythmiaDetected = false;
        }
      }
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1 && this.baseRRInterval > 0) ? 
      Math.abs(this.rrIntervals[0] - this.baseRRInterval) / this.baseRRInterval : 0;
    this.lastRRVariation = rrVariation;
    
    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { rmssd, rrVariation, prematureBeat: this.arrhythmiaDetected }
    };
  }

  /**
   * Get current arrhythmia status
   */
  getStatus(): string {
    return this.hasDetectedFirstArrhythmia ? 
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
