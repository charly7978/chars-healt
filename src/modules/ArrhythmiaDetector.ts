/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Refinar umbrales para ser más precisos en la detección
  private readonly RR_WINDOW_SIZE = 8; // Incrementado para tener mejor contexto
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 7000; // Mayor tiempo para calibración inicial
  private readonly PREMATURE_BEAT_THRESHOLD = 0.80; // Refinado para detectar solo contracciones realmente prematuras
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.45; // Ajustado para mejor balanceo
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.90; // Ajustado para mejor detección de picos normales
  
  // Nuevos umbrales para detección de alta precisión
  private readonly MIN_SEQUENCE_LENGTH = 4; // Mínimo de latidos consecutivos para establecer patrón
  private readonly MAX_FALSE_POSITIVE_RATIO = 0.20; // Máximo ratio de falsos positivos permitido
  private readonly MIN_INTERVAL_VARIATION = 115; // Mínima variación en ms para considerar un cambio de ritmo
  private readonly COMPENSATORY_PAUSE_FACTOR = 1.20; // Factor para detectar pausa compensatoria
  
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
  
  // NUEVO: Almacenamiento de secuencia de picos para análisis preciso
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
  }> = [];
  
  // Nuevas variables para análisis avanzado
  private normalIntervalHistory: number[] = [];
  private intervalTrend: number[] = [];
  private consecutiveNormalBeats: number = 0;
  private lastRejectedPrematureBeat: number = 0;
  
  // DEBUG flag to track detection issues
  private readonly DEBUG_MODE = false; // Desactivado por defecto en producción
  
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
    this.normalIntervalHistory = [];
    this.intervalTrend = [];
    this.consecutiveNormalBeats = 0;
    this.lastRejectedPrematureBeat = 0;
    
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
    // No procesar si no hay intervalos válidos
    if (!intervals || intervals.length === 0) return;
    
    const currentTime = Date.now();
    
    // Actualizar variables globales
    this.lastPeakTime = lastPeakTime;
    
    // Filtrar intervalos claramente no fisiológicos (< 300ms o > 2000ms)
    const validIntervals = intervals.filter(interval => interval >= 300 && interval <= 2000);
    
    if (validIntervals.length === 0) {
      return;
    }
    
    // Guardar amplitud del pico si está disponible
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(peakAmplitude);
      
      // Limitar tamaño del buffer
      if (this.amplitudes.length > this.RR_WINDOW_SIZE * 2) {
        this.amplitudes.shift();
      }
    }
    
    // Calcular amplitud promedio para referencia
    if (this.amplitudes.length >= 4) {
      // Ordenar amplitudes y usar el promedio del segundo y tercer cuartil
      // para eliminar valores atípicos
      const sortedAmplitudes = [...this.amplitudes].sort((a, b) => a - b);
      const q1Index = Math.floor(sortedAmplitudes.length * 0.25);
      const q3Index = Math.floor(sortedAmplitudes.length * 0.75);
      const centralAmplitudes = sortedAmplitudes.slice(q1Index, q3Index + 1);
      this.avgNormalAmplitude = centralAmplitudes.reduce((sum, a) => sum + a, 0) / centralAmplitudes.length;
    }
    
    // Actualizar últimos intervalos RR
    for (const interval of validIntervals) {
      this.rrIntervals.push(interval);
      
      // Guardar tiempo de pico
      if (this.lastPeakTime !== null) {
        const peakTime = this.lastPeakTime - interval;
        this.peakTimes.push(peakTime);
      }
    }
    
    // Limitar tamaño del buffer
    while (this.rrIntervals.length > this.RR_WINDOW_SIZE * 2) {
      this.rrIntervals.shift();
    }
    
    while (this.peakTimes.length > this.RR_WINDOW_SIZE * 2) {
      this.peakTimes.shift();
    }
    
    // Verificar si todavía estamos en fase de aprendizaje
    this.updateLearningPhase();
    
    // Si estamos en fase de aprendizaje, solo calibrar intervalos de base
    if (this.isLearningPhase) {
      this.calibrateBaseIntervals();
      return;
    }
    
    // Analizar los intervalos en busca de arritmias
    this.analyzeRRIntervals();
  }

  // Nuevo método para calibrar intervalos base durante la fase de aprendizaje
  private calibrateBaseIntervals(): void {
    if (this.rrIntervals.length < 5) return;
    
    // Filtrar los intervalos más estables para calibración
    // Ordenar intervalos y eliminar 20% extremos
    const sortedIntervals = [...this.rrIntervals].sort((a, b) => a - b);
    const startIdx = Math.floor(sortedIntervals.length * 0.2);
    const endIdx = Math.floor(sortedIntervals.length * 0.8);
    const stableIntervals = sortedIntervals.slice(startIdx, endIdx + 1);
    
    if (stableIntervals.length >= 3) {
      // Calcular el intervalo base (promedio de intervalos estables)
      this.baseRRInterval = stableIntervals.reduce((sum, interval) => sum + interval, 0) / stableIntervals.length;
      
      // Actualizar historial de intervalos normales
      this.normalIntervalHistory = [...stableIntervals];
      
      // Establecer la tendencia inicial
      this.intervalTrend = [this.baseRRInterval, this.baseRRInterval];
    }
  }

  // Método mejorado para análisis de intervalos RR
  private analyzeRRIntervals(): void {
    if (this.rrIntervals.length < 4) return;
    
    const currentTime = Date.now();
    
    // Verificar si ha pasado suficiente tiempo desde la última arritmia detectada
    // para evitar múltiples detecciones del mismo evento
    if (this.lastArrhythmiaTime > 0 && 
        currentTime - this.lastArrhythmiaTime < 2000) {
      return;
    }
    
    // Obtener los últimos intervalos para análisis
    const recentIntervals = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    if (recentIntervals.length < 3) return;
    
    // Calcular estadísticas básicas de los intervalos recientes
    const avgInterval = recentIntervals.reduce((sum, interval) => sum + interval, 0) / recentIntervals.length;
    
    // Actualizar tendencia de intervalos
    this.updateIntervalTrend(avgInterval);
    
    // Extraer último intervalo para análisis específico
    const lastInterval = recentIntervals[recentIntervals.length - 1];
    const prevInterval = recentIntervals[recentIntervals.length - 2];
    
    // CRITERIO 1: Detección de latido prematuro basado en intervalo corto seguido de pausa compensatoria
    const isPrematureByPattern = 
      lastInterval > avgInterval * this.COMPENSATORY_PAUSE_FACTOR && // Pausa compensatoria después del prematuro
      prevInterval < avgInterval * this.PREMATURE_BEAT_THRESHOLD; // Intervalo corto (latido prematuro)
    
    // CRITERIO 2: Análisis de cambio abrupto en el patrón de intervalos
    const patternDeviation = this.calculatePatternDeviation(recentIntervals);
    const isPatternDisruption = patternDeviation > this.MIN_INTERVAL_VARIATION;
    
    // CRITERIO 3: Verificar amplitud si está disponible (latidos prematuros suelen tener menor amplitud)
    let isAmplitudeAbnormal = false;
    if (this.amplitudes.length >= 2 && this.avgNormalAmplitude > 0) {
      const lastAmplitude = this.amplitudes[this.amplitudes.length - 1];
      const amplitudeRatio = lastAmplitude / this.avgNormalAmplitude;
      isAmplitudeAbnormal = amplitudeRatio < this.AMPLITUDE_RATIO_THRESHOLD;
    }
    
    // Aplicar criterios de calidad para rechazar falsos positivos
    const signalQualityOk = this.validateSignalQuality();
    const sufficientContext = this.consecutiveNormalBeats >= this.MIN_SEQUENCE_LENGTH;
    const notRecentlyRejected = currentTime - this.lastRejectedPrematureBeat > 3000;
    
    // Combinar criterios con lógica ponderada para mejorar precisión
    let prematureBeatConfidence = 0;
    if (isPrematureByPattern) prematureBeatConfidence += 0.60;
    if (isPatternDisruption) prematureBeatConfidence += 0.25;
    if (isAmplitudeAbnormal) prematureBeatConfidence += 0.15;
    
    // Determinar si se ha detectado un latido prematuro con alta confianza
    const isPrematureBeat = prematureBeatConfidence >= 0.70 && 
                           signalQualityOk && 
                           sufficientContext && 
                           notRecentlyRejected;
    
    if (isPrematureBeat) {
      // Actualizar estado de arritmia
      this.arrhythmiaDetected = true;
      this.hasDetectedFirstArrhythmia = true;
      this.lastArrhythmiaTime = currentTime;
      this.arrhythmiaCount++;
      
      // Calcular métricas avanzadas para evaluación de la arritmia
      this.lastRMSSD = this.calculateRMSSD(recentIntervals);
      this.lastRRVariation = this.calculateRRVariation(recentIntervals);
      
      // Reiniciar contador de latidos normales consecutivos
      this.consecutiveNormalBeats = 0;
      
      if (this.DEBUG_MODE) {
        console.log(`[Arritmia] Latido prematuro detectado (#${this.arrhythmiaCount}):`, {
          confianza: prematureBeatConfidence,
          porPatrón: isPrematureByPattern,
          porDisrupción: isPatternDisruption,
          porAmplitud: isAmplitudeAbnormal,
          rmssd: this.lastRMSSD,
          variación: this.lastRRVariation
        });
      }
    } else {
      // No arritmia - actualizar contadores para latidos normales
      this.arrhythmiaDetected = false;
      this.consecutiveNormalBeats++;
      
      // Si hubo candidato rechazado, registrar tiempo
      if (prematureBeatConfidence > 0.4 && prematureBeatConfidence < 0.7) {
        this.lastRejectedPrematureBeat = currentTime;
      }
      
      // Actualizar historial de intervalos normales (solo con latidos confirmados como normales)
      if (prematureBeatConfidence < 0.3 && signalQualityOk) {
        this.normalIntervalHistory.push(lastInterval);
        if (this.normalIntervalHistory.length > 10) {
          this.normalIntervalHistory.shift();
        }
      }
    }
  }

  // Nuevo método para validar calidad de señal
  private validateSignalQuality(): boolean {
    if (this.rrIntervals.length < 4) return false;
    
    // Verificar estabilidad de los intervalos (no muy caóticos)
    const recentIntervals = this.rrIntervals.slice(-5);
    const intervalStdDev = this.calculateStandardDeviation(recentIntervals);
    const avgInterval = recentIntervals.reduce((sum, int) => sum + int, 0) / recentIntervals.length;
    const coefficientOfVariation = intervalStdDev / avgInterval;
    
    // Si la variación es extremadamente alta, posiblemente es ruido
    if (coefficientOfVariation > 0.40) {
      return false;
    }
    
    // Verificar que amplitudes no sean extremadamente variables
    if (this.amplitudes.length >= 5) {
      const recentAmplitudes = this.amplitudes.slice(-5);
      const ampStdDev = this.calculateStandardDeviation(recentAmplitudes);
      const avgAmp = recentAmplitudes.reduce((sum, amp) => sum + amp, 0) / recentAmplitudes.length;
      const ampCoeffVar = ampStdDev / avgAmp;
      
      if (ampCoeffVar > 0.50) {
        return false;
      }
    }
    
    return true;
  }

  // Actualizar tendencia de intervalos
  private updateIntervalTrend(newInterval: number): void {
    this.intervalTrend.push(newInterval);
    if (this.intervalTrend.length > 5) {
      this.intervalTrend.shift();
    }
  }

  // Calcular desviación de patrón para detectar interrupciones repentinas
  private calculatePatternDeviation(intervals: number[]): number {
    if (intervals.length < 3) return 0;
    
    // Calcular diferencia entre último intervalo y promedio de anteriores
    const previousAvg = (intervals.slice(0, -1).reduce((sum, int) => sum + int, 0)) / (intervals.length - 1);
    const lastInterval = intervals[intervals.length - 1];
    
    return Math.abs(lastInterval - previousAvg);
  }

  // Calcular RMSSD (Root Mean Square of Successive Differences)
  private calculateRMSSD(intervals: number[]): number {
    if (intervals.length < 2) return 0;
    
    let sumSquaredDiff = 0;
    for (let i = 1; i < intervals.length; i++) {
      const diff = intervals[i] - intervals[i - 1];
      sumSquaredDiff += diff * diff;
    }
    
    return Math.sqrt(sumSquaredDiff / (intervals.length - 1));
  }

  // Calcular variación RR (coeficiente de variación porcentual)
  private calculateRRVariation(intervals: number[]): number {
    if (intervals.length < 2) return 0;
    
    const avg = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const stdDev = this.calculateStandardDeviation(intervals);
    
    return (stdDev / avg) * 100;
  }

  // Calcular desviación estándar
  private calculateStandardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(variance);
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
    const currentTime = Date.now();
    
    // Si estamos en fase de aprendizaje, no reportar arritmias
    if (this.isLearningPhase) {
      return {
        detected: false,
        count: 0,
        status: `APRENDIENDO|0`,
        data: null
      };
    }
    
    // Actualizar estado de detección si ha pasado demasiado tiempo desde la última arritmia
    // para evitar que la alerta persista indefinidamente
    if (this.arrhythmiaDetected && currentTime - this.lastArrhythmiaTime > 5000) {
      this.arrhythmiaDetected = false;
    }
    
    if (this.arrhythmiaDetected) {
      const status = `ARRITMIA DETECTADA|${this.arrhythmiaCount}`;
      return {
        detected: true,
        count: this.arrhythmiaCount,
        status,
        data: {
          rmssd: this.lastRMSSD,
          rrVariation: this.lastRRVariation,
          prematureBeat: true
        }
      };
    } else if (this.hasDetectedFirstArrhythmia) {
      // Si hubo arritmias anteriormente pero ahora no, mostrar conteo histórico
      const status = `SIN ARRITMIAS|${this.arrhythmiaCount}`;
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status,
        data: null
      };
    } else {
      // Nunca se ha detectado una arritmia
      return {
        detected: false,
        count: 0,
        status: `SIN ARRITMIAS|0`,
        data: null
      };
    }
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
