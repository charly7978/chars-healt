/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 * 
 * OPTIMIZADO: Ahora solo detecta y muestra el pico principal de cada latido
 * REFINADO: Mejor detección de arritmias y amplificación visual de latidos
 */

export class ArrhythmiaDetector {
  // ---- Parámetros de detección de arritmias ----
  private readonly RR_WINDOW_SIZE = 7;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 6000; // Período de aprendizaje
  
  // Parámetros críticos para la detección de latidos prematuros - REOPTIMIZADOS
  private readonly PREMATURE_BEAT_THRESHOLD = 0.78; // AJUSTADO: Más restrictivo (antes 0.82)
  private readonly AMPLITUDE_DIFF_THRESHOLD = 0.4; // AJUSTADO: Mayor diferencia requerida (antes 0.35)
  
  // Parámetros para el filtrado de picos y visualización
  private readonly PEAK_PROMINENCE_THRESHOLD = 0.5; // AJUSTADO: Mayor prominencia requerida (antes 0.4)
  private readonly MIN_PEAK_DISTANCE_MS = 380; // AJUSTADO: Mayor separación mínima (antes 350)
  private readonly MAX_ACCEPTABLE_RR_MS = 1700; // Intervalo RR máximo aceptable (35 BPM mín)
  
  // Parámetros de validación avanzada
  private readonly PATTERN_ANALYSIS_WINDOW = 5; // Analizar los últimos 5 latidos para patrones
  private readonly MIN_TIME_BETWEEN_ARRHYTHMIAS_MS = 3500; // AJUSTADO: Mayor tiempo entre arritmias (antes 2500)
  private readonly MAX_CONSECUTIVE_PREMATURE = 1; // Máximo de latidos prematuros consecutivos permitidos
  
  // NUEVO: Parámetros de amplificación visual
  private readonly VISUAL_AMPLIFICATION_FACTOR = 1.75; // Factor de amplificación para visualización
  private readonly MIN_VISUAL_HEIGHT = 0.3; // Altura mínima visual para latidos débiles

  // ---- Estado interno ----
  private rrIntervals: number[] = []; // Intervalos entre picos principales
  private peakAmplitudes: number[] = []; // Amplitudes de los picos principales
  private peakTimes: number[] = []; // Tiempos exactos de los picos principales
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
  private baseRRInterval: number = 0; // Intervalo RR basal (normal)
  
  // Variables para análisis avanzado
  private consecutivePrematureCount = 0;
  private lastAnalyzedPeakTime: number = 0;
  private maxAmplitudeObserved: number = 0; // NUEVO: Para normalización
  
  // Estado para visualización - SOLO PICOS PRINCIPALES
  private mainPeaks: Array<{
    time: number;
    amplitude: number; // Amplitud original
    visualAmplitude: number; // NUEVO: Amplitud amplificada para visualización
    isArrhythmia: boolean;
  }> = [];
  
  // ELIMINADO: Ya no hay límite en la detección de arritmias
  // private readonly MAX_ARRHYTHMIAS_PER_SESSION = 15;
  
  // ---- Configuración del modo de depuración ----
  private readonly DEBUG_MODE = true;
  
  // ---- Métodos públicos ----
  
  /**
   * Reset all detector states and data
   */
  reset(): void {
    this.rrIntervals = [];
    this.peakAmplitudes = [];
    this.peakTimes = [];
    this.mainPeaks = [];
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.measurementStartTime = Date.now();
    this.arrhythmiaCount = 0;
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.consecutivePrematureCount = 0;
    this.lastAnalyzedPeakTime = 0;
    this.maxAmplitudeObserved = 0;
    
    if (this.DEBUG_MODE) {
      console.log("ArrhythmiaDetector: Reset complete");
    }
  }

  /**
   * Check if the detector is in learning phase
   */
  isInLearningPhase(): boolean {
    return this.isLearningPhase;
  }

  /**
   * Update learning phase status based on time and data
   */
  updateLearningPhase(): void {
    const elapsed = Date.now() - this.measurementStartTime;
    
    // Si estamos en fase de aprendizaje y ha pasado suficiente tiempo
    if (this.isLearningPhase && elapsed >= this.ARRHYTHMIA_LEARNING_PERIOD) {
      // Verificar que tenemos suficientes datos para salir de la fase de aprendizaje
      if (this.rrIntervals.length >= 5) {
        this.isLearningPhase = false;
        
        // Calcular línea base para intervalos RR normales
        this.calculateBaseRRInterval();
        
        // Calcular amplitud media de picos normales
        this.calculateAverageNormalAmplitude();
        
        if (this.DEBUG_MODE) {
          console.log(`ArrhythmiaDetector: Learning phase complete.
            Base RR: ${this.baseRRInterval.toFixed(0)}ms,
            Avg Amplitude: ${this.avgNormalAmplitude.toFixed(2)},
            Max Amplitude: ${this.maxAmplitudeObserved.toFixed(2)}`);
        }
      } else {
        // Extender la fase de aprendizaje si no hay datos suficientes
        this.measurementStartTime = Date.now() - (this.ARRHYTHMIA_LEARNING_PERIOD / 2);
        
        if (this.DEBUG_MODE) {
          console.log("ArrhythmiaDetector: Extended learning phase due to insufficient data");
        }
      }
    }
  }

  /**
   * Calculate baseline for normal RR intervals using a robust algorithm
   */
  private calculateBaseRRInterval(): void {
    if (this.rrIntervals.length < 4) {
      this.baseRRInterval = 0;
      return;
    }
    
    // MEJORADO: Algoritmo más robusto de mediana ponderada
    const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
    
    // Descartar valores extremos (20% superior e inferior) - AJUSTADO
    const trimIndex = Math.floor(sortedRR.length * 0.2);
    const trimmedRR = sortedRR.slice(trimIndex, sortedRR.length - trimIndex);
    
    // Si quedan suficientes valores, calcular mediana
    if (trimmedRR.length >= 3) {
      const midIndex = Math.floor(trimmedRR.length / 2);
      this.baseRRInterval = trimmedRR.length % 2 === 0
        ? (trimmedRR[midIndex - 1] + trimmedRR[midIndex]) / 2
        : trimmedRR[midIndex];
    } else if (trimmedRR.length > 0) {
      // Si hay pocos valores, usar el promedio
      this.baseRRInterval = trimmedRR.reduce((sum, val) => sum + val, 0) / trimmedRR.length;
    } else {
      // Valor por defecto si no hay datos válidos (70 BPM)
      this.baseRRInterval = 857;
    }
  }
  
  /**
   * Calculate average amplitude for normal peaks
   */
  private calculateAverageNormalAmplitude(): void {
    if (this.peakAmplitudes.length < 3) {
      this.avgNormalAmplitude = 1.0;
      return;
    }
    
    // Usar algoritmo de media truncada para mayor precisión
    const sortedAmplitudes = [...this.peakAmplitudes].sort((a, b) => a - b);
    const trimIndex = Math.floor(sortedAmplitudes.length * 0.15); // Eliminar el 15% de valores extremos
    const trimmedAmplitudes = sortedAmplitudes.slice(trimIndex, sortedAmplitudes.length - trimIndex);
    
    if (trimmedAmplitudes.length > 0) {
      this.avgNormalAmplitude = trimmedAmplitudes.reduce((sum, val) => sum + val, 0) / trimmedAmplitudes.length;
      
      // NUEVO: Actualizar máxima amplitud observada (para normalización)
      this.maxAmplitudeObserved = Math.max(
        this.maxAmplitudeObserved,
        sortedAmplitudes[sortedAmplitudes.length - 1]
      );
    } else {
      this.avgNormalAmplitude = 1.0;
    }
  }

  /**
   * Update RR intervals with new data
   * OPTIMIZADO: Ahora solo procesa y almacena los picos principales
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    if (!intervals || intervals.length === 0 || !lastPeakTime || peakAmplitude === undefined) return;
    
    const currentTime = Date.now();
    
    // NUEVO: Actualizar máxima amplitud observada en tiempo real
    if (peakAmplitude > this.maxAmplitudeObserved) {
      this.maxAmplitudeObserved = peakAmplitude;
    }
    
    // MEJORADO: Verificación más estricta de picos principales
    if (!this.isValidMainPeak(lastPeakTime, peakAmplitude)) {
      if (this.DEBUG_MODE) {
        console.log(`ArrhythmiaDetector: Pico rechazado - tiempo: ${lastPeakTime}, amplitud: ${peakAmplitude}`);
      }
      return;
    }
    
    // Solo considerar el primer intervalo (el más reciente)
    const latestInterval = intervals[0];
    
    // Verificar si el intervalo está dentro de rangos fisiológicos
    if (latestInterval < this.MIN_PEAK_DISTANCE_MS || latestInterval > this.MAX_ACCEPTABLE_RR_MS) {
      if (this.DEBUG_MODE) {
        console.log(`ArrhythmiaDetector: Intervalo RR fuera de rango - ${latestInterval}ms`);
      }
      return;
    }
    
    // Almacenar datos del pico principal
    this.rrIntervals.push(latestInterval);
    this.peakAmplitudes.push(peakAmplitude);
    this.peakTimes.push(lastPeakTime);
    
    // Limitar tamaño de arrays
    if (this.rrIntervals.length > this.RR_WINDOW_SIZE) {
      this.rrIntervals.shift();
      this.peakAmplitudes.shift();
      this.peakTimes.shift();
    }
    
    // Actualizar última referencia de tiempo
    this.lastPeakTime = lastPeakTime;
    
    // Determinar si este pico principal es un latido prematuro o normal
    // pero solo si ya no estamos en fase de aprendizaje
    if (!this.isLearningPhase && this.baseRRInterval > 0) {
      this.analyzeMainPeak(latestInterval, peakAmplitude, lastPeakTime);
    } else {
      // Durante fase de aprendizaje, registrar pico normal amplificado
      const visualAmplitude = this.amplifyForVisualization(peakAmplitude);
      this.mainPeaks.push({
        time: lastPeakTime,
        amplitude: peakAmplitude,
        visualAmplitude: visualAmplitude,
        isArrhythmia: false
      });
      
      // Mantener solo los últimos 25 picos para visualización
      if (this.mainPeaks.length > 25) {
        this.mainPeaks.shift();
      }
    }
    
    // Actualizar estado de la fase de aprendizaje
    this.updateLearningPhase();
  }
  
  /**
   * MEJORADO: Amplifica la señal para visualización más potente
   */
  private amplifyForVisualization(amplitude: number): number {
    // Si no tenemos referencia, devolver valor original ligeramente amplificado
    if (this.maxAmplitudeObserved <= 0) {
      return amplitude * 1.2;
    }
    
    // Calcular valor normalizado (0-1)
    const normalizedValue = amplitude / this.maxAmplitudeObserved;
    
    // Aplicar "latigazo" usando una función no lineal (potencia)
    // Esto crea una curva más pronunciada - efecto "pico de rayo"
    const poweredValue = Math.pow(normalizedValue, 0.7);
    
    // Aplicar amplificación y asegurar altura mínima
    const amplifiedValue = Math.max(
      this.MIN_VISUAL_HEIGHT,
      poweredValue * this.VISUAL_AMPLIFICATION_FACTOR
    );
    
    return amplifiedValue;
  }
  
  /**
   * MEJORADO: Verifica con criterios más estrictos si un pico debe ser considerado como principal
   */
  private isValidMainPeak(peakTime: number, amplitude: number): boolean {
    // Si es el primer pico o ha pasado mucho tiempo desde el último, aceptarlo
    if (this.lastPeakTime === null || (peakTime - this.lastPeakTime) > 1200) {
      return true;
    }
    
    // Rechazar picos demasiado cercanos al último (evitar detecciones múltiples del mismo latido)
    // AJUSTADO: Distancia mínima entre picos principales incrementada
    if ((peakTime - this.lastPeakTime) < this.MIN_PEAK_DISTANCE_MS) {
      return false;
    }
    
    // MEJORADO: Verificar prominencia respecto a la media reciente
    if (this.peakAmplitudes.length >= 3 && this.avgNormalAmplitude > 0) {
      const recentAvg = this.peakAmplitudes.slice(-3).reduce((sum, val) => sum + val, 0) / 3;
      
      // Rechazar picos débiles comparados con la media reciente
      if (amplitude < recentAvg * 0.4) {
        return false;
      }
    }
    
    // Verificar que el pico es suficientemente prominente en términos absolutos
    if (this.avgNormalAmplitude > 0 && amplitude < this.avgNormalAmplitude * 0.35) {
      return false;
    }
    
    return true;
  }
  
  /**
   * MEJORADO: Analiza un pico principal con criterios más estrictos
   * para determinar si es un latido prematuro o normal
   */
  private analyzeMainPeak(rrInterval: number, amplitude: number, timestamp: number): void {
    // REFINADO: Criterios más estrictos para latidos prematuros
    const rrRatio = rrInterval / this.baseRRInterval;
    const isShortRR = rrRatio < this.PREMATURE_BEAT_THRESHOLD;
    
    // Analizar amplitud con referencia a los últimos latidos, no solo al promedio global
    let relativeAmplitude = 1.0;
    if (this.peakAmplitudes.length >= 3) {
      const recentAmplitudes = this.peakAmplitudes.slice(-3);
      const recentAvg = recentAmplitudes.reduce((sum, val) => sum + val, 0) / recentAmplitudes.length;
      relativeAmplitude = amplitude / recentAvg;
    }
    
    // Criterio de amplitud anormal - AJUSTADO
    const hasAbnormalAmplitude = Math.abs(relativeAmplitude - 1.0) > this.AMPLITUDE_DIFF_THRESHOLD;
    
    // NUEVO: Verificar compensación en los intervalos adyacentes
    const hasCompensatoryPause = this.checkCompensatoryPause();
    
    // Analizar patrón completo de los últimos latidos
    const hasAbnormalPattern = this.analyzeRRPattern();
    
    // REFINADO: Múltiples criterios para confirmar latido prematuro
    // Ahora requiere al menos dos criterios o un patrón de compensación clara
    const isPremature = (isShortRR && hasAbnormalAmplitude) || 
                        (isShortRR && hasAbnormalPattern) ||
                        hasCompensatoryPause;
    
    // Control de consecutivos para evitar falsos positivos
    let isArrhythmia = false;
    
    if (isPremature) {
      this.consecutivePrematureCount++;
      
      // AJUSTADO: Solo contar como arritmia si no excede el límite de consecutivos
      // y ha pasado suficiente tiempo desde la última
      if (this.consecutivePrematureCount <= this.MAX_CONSECUTIVE_PREMATURE && 
          timestamp - this.lastArrhythmiaTime >= this.MIN_TIME_BETWEEN_ARRHYTHMIAS_MS) {
        isArrhythmia = true;
      }
    } else {
      // Reiniciar contador de prematuros consecutivos
      this.consecutivePrematureCount = 0;
    }
    
    // NUEVO: Amplificar visualización usando nuestra función de "latigazo"
    const visualAmplitude = this.amplifyForVisualization(amplitude);
    
    // Registrar el pico para visualización - SOLO UN CÍRCULO POR LATIDO
    this.mainPeaks.push({
      time: timestamp,
      amplitude: amplitude,
      visualAmplitude: visualAmplitude,
      isArrhythmia: isArrhythmia
    });
    
    // Mantener solo los últimos 25 picos para visualización
    if (this.mainPeaks.length > 25) {
      this.mainPeaks.shift();
    }
    
    // Si es arritmia, actualizar contadores y estado
    if (isArrhythmia) {
      this.lastArrhythmiaTime = timestamp;
      this.arrhythmiaCount++;
      this.hasDetectedFirstArrhythmia = true;
      
      if (this.DEBUG_MODE) {
        console.log(`ArrhythmiaDetector: LATIDO PREMATURO #${this.arrhythmiaCount} detectado. 
          RR: ${rrInterval}ms (${(rrRatio * 100).toFixed(0)}%) vs Base: ${this.baseRRInterval}ms, 
          Amplitud: ${amplitude.toFixed(2)} (${(relativeAmplitude * 100).toFixed(0)}%)`);
      }
    }
  }
  
  /**
   * NUEVO: Verifica si hay pausas compensatorias (característica clave de extrasístoles)
   */
  private checkCompensatoryPause(): boolean {
    if (this.rrIntervals.length < 4 || this.baseRRInterval <= 0) return false;
    
    const intervals = this.rrIntervals.slice(-4);
    
    // Patrón típico de latido prematuro con pausa compensatoria:
    // [normal]-[corto]-[largo]-[normal]
    
    // Verificar el segundo intervalo (corto)
    const isSecondShort = intervals[1] < this.baseRRInterval * 0.82;
    
    // Verificar el tercer intervalo (largo - pausa compensatoria)
    const isThirdLong = intervals[2] > this.baseRRInterval * 1.3;
    
    // La suma del intervalo corto + largo debería aproximarse a 2 intervalos normales
    const sumShortLong = intervals[1] + intervals[2];
    const isCompensated = sumShortLong > this.baseRRInterval * 1.8 && 
                         sumShortLong < this.baseRRInterval * 2.2;
    
    return isSecondShort && isThirdLong && isCompensated;
  }
  
  /**
   * REFINADO: Analiza el patrón de intervalos RR para detectar irregularidades
   */
  private analyzeRRPattern(): boolean {
    if (this.rrIntervals.length < 4) return false;
    
    // Obtener los últimos intervalos RR
    const recentRR = this.rrIntervals.slice(-4);
    
    // Verificar si hay un patrón de aceleración seguido de desaceleración
    const diffs = [];
    for (let i = 1; i < recentRR.length; i++) {
      diffs.push(recentRR[i] - recentRR[i-1]);
    }
    
    // Un patrón típico sería: [-, +, -] o [-, +, +]
    // donde - indica acortamiento y + indica alargamiento
    return (diffs[0] < 0 && diffs[1] > 0) && 
           (Math.abs(diffs[0]) > this.baseRRInterval * 0.15);
  }

  /**
   * Perform arrhythmia detection and analysis
   * MEJORADO: Ahora basado únicamente en los picos principales
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // No realizar detección durante la fase de aprendizaje
    if (this.isLearningPhase || this.rrIntervals.length < 4) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.getStatus(),
        data: null
      };
    }
    
    const currentTime = Date.now();
    
    // Buscar latidos prematuros recientes
    const recentPrematures = this.mainPeaks.filter(peak => 
      peak.isArrhythmia && currentTime - peak.time < 3000
    );
    
    // Verificar si hay arritmia reciente
    const hasPrematureBeat = recentPrematures.length > 0;
    
    // Calcular métricas de variabilidad
    const rrVariation = this.calculateRRVariability();
    const rmssd = this.calculateRMSSD();
    
    // Almacenar últimos valores calculados
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
    
    // Verificar si hay arritmia activa
    const isActivePremature = hasPrematureBeat && 
                           currentTime - recentPrematures[recentPrematures.length - 1].time < 1000;
    
    return {
      detected: isActivePremature,
      count: this.arrhythmiaCount,
      status: this.getStatus(),
      data: {
        rmssd,
        rrVariation,
        prematureBeat: hasPrematureBeat
      }
    };
  }
  
  /**
   * OPTIMIZADO: Calcular la variabilidad de los intervalos RR
   */
  private calculateRRVariability(): number {
    if (this.rrIntervals.length < 3) return 0;
    
    const recentIntervals = this.rrIntervals.slice(-3);
    const diffs = [];
    
    for (let i = 1; i < recentIntervals.length; i++) {
      diffs.push(Math.abs(recentIntervals[i] - recentIntervals[i-1]));
    }
    
    return diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length;
  }
  
  /**
   * Calcular RMSSD (Root Mean Square of Successive Differences)
   */
  private calculateRMSSD(): number {
    if (this.rrIntervals.length < 4) return 0;
    
    const recentIntervals = this.rrIntervals.slice(-4);
    let sumSquaredDiff = 0;
    let count = 0;
    
    for (let i = 1; i < recentIntervals.length; i++) {
      const diff = recentIntervals[i] - recentIntervals[i-1];
      sumSquaredDiff += diff * diff;
      count++;
    }
    
    return count > 0 ? Math.sqrt(sumSquaredDiff / count) : 0;
  }

  /**
   * Get detector status string
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
   * Obtener los picos principales para visualización - SOLO UN CÍRCULO POR LATIDO
   * ACTUALIZADO: Ahora devuelve la amplitud visual amplificada para un "latigazo" más pronunciado
   */
  getMainPeaks(): Array<{time: number, amplitude: number, isArrhythmia: boolean}> {
    // Devolver los picos con la amplitud visual en lugar de la original
    return this.mainPeaks.map(peak => ({
      time: peak.time,
      amplitude: peak.visualAmplitude, // CLAVE: Usar la amplitud amplificada para visualización
      isArrhythmia: peak.isArrhythmia
    }));
  }
  
  /**
   * Clean memory function for resource management
   */
  cleanMemory(): void {
    this.reset();
  }
}
