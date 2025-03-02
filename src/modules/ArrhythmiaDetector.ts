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
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 6000; // 6 segundos
  // Umbrales ajustados para mayor precisión
  private readonly PREMATURE_BEAT_THRESHOLD = 0.85; // Reducido para evitar detecciones excesivas
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.35; // Aumentado para exigir diferencias más notables
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.95; // Reducido para aceptar más variabilidad natural
  // Nuevos parámetros para mejorar la detección
  private readonly MIN_PREMATURE_INTERVAL_MS = 550; // Intervalo mínimo considerado prematuro (ms)
  private readonly PATTERN_VALIDATION_WINDOW = 5; // Ventana para validar patrones
  private readonly POST_PREMATURE_COMPENSATION_MS = 200; // Compensación después de latido prematuro
  
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
   * Update learning phase status
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
        this.isLearningPhase = false;
        
        // Calculate base values after learning phase
        if (this.amplitudes.length > 5) {
          // Utilizar una mediana ponderada hacia arriba para obtener la amplitud normal
          // para que refleje mejor los picos normales
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          
          // Usar el tercio superior como referencia para la amplitud normal
          const normalCount = Math.max(3, Math.ceil(sortedAmplitudes.length * 0.33));
          const topAmplitudes = sortedAmplitudes.slice(0, normalCount);
          this.avgNormalAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
          
          console.log('ArrhythmiaDetector - Amplitud normal de referencia:', {
            avgNormalAmplitude: this.avgNormalAmplitude,
            totalSamples: this.amplitudes.length,
            topValues: topAmplitudes
          });
        }
        
        // Calcular intervalo RR normal de referencia
        if (this.rrIntervals.length > 5) {
          // Ordenar RR de menor a mayor
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // Eliminar outliers (10% inferior y superior)
          const cutSize = Math.max(1, Math.floor(sortedRR.length * 0.1));
          const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
          
          // Usar la mediana como referencia de intervalo normal
          const medianIndex = Math.floor(filteredRR.length / 2);
          this.baseRRInterval = filteredRR[medianIndex];
          
          console.log('ArrhythmiaDetector - Intervalo RR normal:', {
            baseRRInterval: this.baseRRInterval,
            totalSamples: this.rrIntervals.length
          });
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
    if (this.peakSequence.length >= 4 && this.normalizedRRPattern.length >= 3) {
      const checkPrematureBeat = () => {
        const currentTime = Date.now();
        
        // Obtener los dos últimos intervalos
        const lastNormalizedRR = this.normalizedRRPattern[0];
        const prevNormalizedRR = this.normalizedRRPattern[1];
        
        // Obtener amplitudes para comparación contextual
        const lastPeaks = this.peakSequence.slice(-3);
        
        // Indicadores de posible latido prematuro
        const isRRIntervalShort = lastNormalizedRR < 0.85; // 85% del intervalo normal
        const isPreviousIntervalNormal = prevNormalizedRR > 0.90 && prevNormalizedRR < 1.15;
        
        // Validación contextual de amplitud: latidos prematuros suelen tener menor amplitud
        const lastPeakAmplitude = lastPeaks[2]?.amplitude || 0;
        const prevPeakAmplitude = lastPeaks[1]?.amplitude || 0;
        const amplitudeRatio = lastPeakAmplitude > 0 ? lastPeakAmplitude / prevPeakAmplitude : 1;
        const isAmplitudeConsistent = amplitudeRatio >= this.AMPLITUDE_RATIO_THRESHOLD;
        
        // Análisis temporal - evitar detecciones muy cercanas
        const timeSinceLastPremature = currentTime - this.lastPrematureTime;
        const tooCloseToLastPremature = timeSinceLastPremature < (this.baseRRInterval * 2);
        
        // Verificar tiempo desde última detección de falso positivo para evitar repetir errores
        const timeSinceLastFalsePositive = currentTime - this.lastFalsePositiveTime;
        const inFalsePositiveCooldown = timeSinceLastFalsePositive < 2000; // 2 segundos de cooldown
        
        // Compensación post-prematura: después de un latido prematuro suele haber compensación
        const isPossibleCompensation = 
          timeSinceLastPremature < (this.baseRRInterval + this.POST_PREMATURE_COMPENSATION_MS) &&
          timeSinceLastPremature > this.MIN_PREMATURE_INTERVAL_MS;
        
        // Validación fisiológica integrada
        const isPhysiologicallyValid = 
          this.lastRRVariation > 0.12 && // Debe haber cierta variabilidad
          !isPossibleCompensation &&     // No estar en periodo de compensación
          !tooCloseToLastPremature &&    // No muy cercano al último prematuro
          !inFalsePositiveCooldown;      // No en periodo de enfriamiento por falso positivo
        
        // Algoritmo principal de decisión con contexto temporal y fisiológico
        const isPrematureBeat = 
          isRRIntervalShort && 
          isPreviousIntervalNormal &&
          isAmplitudeConsistent &&
          isPhysiologicallyValid;
        
        // Si detectamos latido prematuro, actualizamos el estado
        if (isPrematureBeat) {
          this.lastPrematureTime = currentTime;
          return true;
        } 
        // Si parecía prematuro pero no pasó todas las validaciones, registramos como falso positivo
        else if (isRRIntervalShort && !inFalsePositiveCooldown) {
          this.lastFalsePositiveTime = currentTime;
        }
        
        return false;
      };
      
      // Aplicamos la lógica de detección
      const isPrematureBeat = checkPrematureBeat();
      
      // Basado en el resultado, actualizamos el estado
      if (isPrematureBeat && !this.arrhythmiaDetected) {
        this.arrhythmiaDetected = true;
        this.arrhythmiaCount++;
        this.lastArrhythmiaTime = Date.now();
      } else if (!isPrematureBeat && this.arrhythmiaDetected) {
        // Reiniciar solo si ha pasado suficiente tiempo
        const timeSinceLastArrhythmia = Date.now() - this.lastArrhythmiaTime;
        if (timeSinceLastArrhythmia > 1500) { // 1.5 segundos
          this.arrhythmiaDetected = false;
        }
      }
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // Solo contar arritmias si suficiente tiempo desde la última (500ms) para evitar duplicados
    if (this.arrhythmiaDetected && currentTime - this.lastArrhythmiaTime > 500) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - NUEVA ARRITMIA CONTABILIZADA:', {
        count: this.arrhythmiaCount,
          timestamp: currentTime,
          amplitudes: this.amplitudes.slice(-5),
          peakSequence: this.peakSequence.slice(-5).map(p => ({
            type: p.type,
            ratio: p.amplitude / this.avgNormalAmplitude
          }))
        });
      }
    }

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
