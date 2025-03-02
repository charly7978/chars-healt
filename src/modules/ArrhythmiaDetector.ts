/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 * 
 * OPTIMIZADO: Ahora solo detecta y muestra el pico principal de cada latido
 */

export class ArrhythmiaDetector {
  // ---- Parámetros de detección de arritmias ----
  private readonly RR_WINDOW_SIZE = 7;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 6000; // Período de aprendizaje
  
  // Parámetros críticos para la detección de latidos prematuros - REOPTIMIZADOS
  private readonly PREMATURE_BEAT_THRESHOLD = 0.82; // Umbral para considerar un latido prematuro (intervalo RR)
  private readonly AMPLITUDE_DIFF_THRESHOLD = 0.35; // Umbral para diferencias de amplitud entre picos
  
  // Parámetros para el filtrado de picos y visualización
  private readonly PEAK_PROMINENCE_THRESHOLD = 0.4; // Solo picos prominentes serán considerados
  private readonly MIN_PEAK_DISTANCE_MS = 350; // Distancia mínima entre picos en ms (170 BPM máx)
  private readonly MAX_ACCEPTABLE_RR_MS = 1700; // Intervalo RR máximo aceptable (35 BPM mín)
  
  // Parámetros de validación avanzada
  private readonly PATTERN_ANALYSIS_WINDOW = 5; // Analizar los últimos 5 latidos para patrones
  private readonly MIN_TIME_BETWEEN_ARRHYTHMIAS_MS = 2500; // Tiempo mínimo entre arritmias
  private readonly MAX_CONSECUTIVE_PREMATURE = 1; // Máximo de latidos prematuros consecutivos permitidos

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
  
  // Estado para visualización - SOLO PICOS PRINCIPALES
  private mainPeaks: Array<{
    time: number;
    amplitude: number;
    isArrhythmia: boolean;
  }> = [];
  
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
            Avg Amplitude: ${this.avgNormalAmplitude.toFixed(2)}`);
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
    
    // Usar algoritmo de mediana ponderada para mayor robustez
    const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
    
    // Descartar valores extremos (15% superior e inferior)
    const trimIndex = Math.floor(sortedRR.length * 0.15);
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
    
    // NUEVO: Verificar si este pico es válido para ser considerado como principal
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
    }
    
    // Actualizar estado de la fase de aprendizaje
    this.updateLearningPhase();
  }
  
  /**
   * NUEVO: Verifica si un pico debe ser considerado como pico principal (sistólico)
   */
  private isValidMainPeak(peakTime: number, amplitude: number): boolean {
    // Si es el primer pico o ha pasado mucho tiempo desde el último, aceptarlo
    if (this.lastPeakTime === null || (peakTime - this.lastPeakTime) > 1200) {
      return true;
    }
    
    // Rechazar picos demasiado cercanos al último (evitar detecciones múltiples del mismo latido)
    if ((peakTime - this.lastPeakTime) < this.MIN_PEAK_DISTANCE_MS) {
      return false;
    }
    
    // Verificar que el pico es suficientemente prominente
    if (this.avgNormalAmplitude > 0 && amplitude < this.avgNormalAmplitude * 0.25) {
      return false;
    }
    
    return true;
  }
  
  /**
   * NUEVO: Analiza un pico principal para determinar si es un latido prematuro o normal
   * y actualiza el array de picos principales para visualización
   */
  private analyzeMainPeak(rrInterval: number, amplitude: number, timestamp: number): void {
    // Criterios para determinar si es un latido prematuro
    const isShortRR = rrInterval < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD;
    const hasAbnormalAmplitude = Math.abs(amplitude - this.avgNormalAmplitude) / this.avgNormalAmplitude > this.AMPLITUDE_DIFF_THRESHOLD;
    
    // Analizar patrón completo de los últimos latidos
    const hasAbnormalPattern = this.analyzeRRPattern();
    
    // Determinar si es un latido prematuro
    const isPremature = isShortRR && (hasAbnormalAmplitude || hasAbnormalPattern);
    
    // Control de consecutivos para evitar falsos positivos
    let isArrhythmia = false;
    
    if (isPremature) {
      this.consecutivePrematureCount++;
      
      // Solo contar como arritmia si no excede el límite de consecutivos
      // y ha pasado suficiente tiempo desde la última
      if (this.consecutivePrematureCount <= this.MAX_CONSECUTIVE_PREMATURE && 
          timestamp - this.lastArrhythmiaTime >= this.MIN_TIME_BETWEEN_ARRHYTHMIAS_MS) {
        isArrhythmia = true;
      }
    } else {
      // Reiniciar contador de prematuros consecutivos
      this.consecutivePrematureCount = 0;
    }
    
    // Registrar el pico para visualización - SOLO UN CÍRCULO POR LATIDO
    this.mainPeaks.push({
      time: timestamp,
      amplitude: amplitude,
      isArrhythmia: isArrhythmia
    });
    
    // Mantener solo los últimos 20 picos para visualización
    if (this.mainPeaks.length > 20) {
      this.mainPeaks.shift();
    }
    
    // Si es arritmia, actualizar contadores y estado
    if (isArrhythmia) {
      this.lastArrhythmiaTime = timestamp;
      this.arrhythmiaCount++;
      this.hasDetectedFirstArrhythmia = true;
      
      if (this.DEBUG_MODE) {
        console.log(`ArrhythmiaDetector: LATIDO PREMATURO #${this.arrhythmiaCount} detectado. 
          RR: ${rrInterval}ms vs Base: ${this.baseRRInterval}ms, 
          Amplitud: ${amplitude.toFixed(2)} vs Avg: ${this.avgNormalAmplitude.toFixed(2)}`);
      }
    }
  }
  
  /**
   * NUEVO: Analiza el patrón de intervalos RR para detectar irregularidades
   */
  private analyzeRRPattern(): boolean {
    if (this.rrIntervals.length < 3) return false;
    
    // Obtener los últimos intervalos RR
    const recentRR = this.rrIntervals.slice(-3);
    
    // Un patrón típico de extrasístole: intervalo corto seguido de intervalo compensatorio largo
    // Verificar si el penúltimo intervalo es significativamente más corto que el promedio
    const isMiddleShort = recentRR[1] < this.baseRRInterval * 0.85;
    
    // Y el último intervalo es más largo (pausa compensatoria)
    const isLastLong = recentRR[2] > this.baseRRInterval * 1.15;
    
    return isMiddleShort && isLastLong;
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
   * NUEVO: Este método permite obtener solo los picos principales para dibujar
   */
  getMainPeaks(): Array<{time: number, amplitude: number, isArrhythmia: boolean}> {
    return this.mainPeaks;
  }
  
  /**
   * Clean memory function for resource management
   */
  cleanMemory(): void {
    this.reset();
  }
}
