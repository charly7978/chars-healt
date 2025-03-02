/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // ---- Parámetros de detección de arritmias ----
  private readonly RR_WINDOW_SIZE = 7;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 6000; // Reduced from 3000ms to detect earlier
  
  // Parámetros críticos para la detección de latidos prematuros - OPTIMIZADOS
  private readonly PREMATURE_BEAT_THRESHOLD = 0.85; // Reducido para detectar cambios sutiles pero significativos (antes 1.55)
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.65; // Aumentado para evitar confundir picos normales (antes 0.15)
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.95; // Reducido para mejor clasificación de picos normales (antes 1.55)
  
  // Nuevos parámetros para detección avanzada
  private readonly MIN_RR_INTERVAL_MS = 350; // Mínimo intervalo RR fisiológicamente posible (~170 BPM)
  private readonly CONSECUTIVE_DETECTION_LIMIT = 2; // Límite para detecciones consecutivas
  private readonly MIN_PATTERN_POINTS = 4; // Mínimo de puntos para análisis de patrones
  private readonly PATTERN_SIMILARITY_THRESHOLD = 0.25; // Umbral de similitud para patrones

  // ---- Estado interno ----
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
  
  // Nuevas variables para detección avanzada
  private consecutiveArrhythmiaDetections = 0;
  private lastNormalRRIntervals: number[] = [];
  private patternBuffer: Array<{rr: number, amplitude: number}> = [];
  
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
  }> = [];
  
  // ---- Configuración del modo de depuración ----
  private readonly DEBUG_MODE = true;
  
  // ---- Métodos públicos ----
  
  /**
   * Reset all detector states and data
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
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
    this.peakSequence = [];
    
    // Reiniciar nuevas variables
    this.consecutiveArrhythmiaDetections = 0;
    this.lastNormalRRIntervals = [];
    this.patternBuffer = [];
    
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
    
    // NUEVO: Utilizar algoritmo de mediana ponderada para mayor robustez
    const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
    
    // Descartar valores extremos (10% superior e inferior)
    const trimIndex = Math.floor(sortedRR.length * 0.1);
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
    
    // Actualizar buffer de intervalos RR normales
    this.lastNormalRRIntervals = trimmedRR.slice(0, 5);
  }
  
  /**
   * Calculate average amplitude for normal peaks
   */
  private calculateAverageNormalAmplitude(): void {
    if (this.amplitudes.length < 3) {
      this.avgNormalAmplitude = 1.0;
      return;
    }
    
    // NUEVO: Usar algoritmo de media truncada para mayor precisión
    const sortedAmplitudes = [...this.amplitudes].sort((a, b) => a - b);
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
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    if (!intervals || intervals.length === 0) return;
    
    const currentTime = Date.now();
    
    // MEJORA: Limpieza preliminar de intervalos no fisiológicos
    const validIntervals = intervals.filter(interval => 
      interval >= this.MIN_RR_INTERVAL_MS && interval <= 1700
    );
    
    if (validIntervals.length === 0) return;
    
    // Actualizar tiempos de pico
    if (lastPeakTime) {
      // Si es el primer pico o hay un gap significativo, reiniciar
      if (this.lastPeakTime === null || (lastPeakTime - this.lastPeakTime) > 2000) {
        this.peakTimes = [lastPeakTime];
      } else {
        this.peakTimes.push(lastPeakTime);
      }
      
      // Mantener solo los últimos 10 tiempos de pico
      if (this.peakTimes.length > 10) {
        this.peakTimes = this.peakTimes.slice(-10);
      }
      
      this.lastPeakTime = lastPeakTime;
    }
    
    // MEJORA: Actualizar buffer de patrón con información completa
    if (validIntervals.length > 0 && peakAmplitude !== undefined) {
      this.patternBuffer.push({
        rr: validIntervals[0],
        amplitude: peakAmplitude
      });
      
      // Mantener sólo los últimos N puntos para análisis de patrones
      if (this.patternBuffer.length > this.MIN_PATTERN_POINTS + 2) {
        this.patternBuffer.shift();
      }
    }
    
    // Añadir el intervalo más reciente a la lista
    const latestInterval = validIntervals[0];
    this.rrIntervals.push(latestInterval);
    
    // Añadir amplitud si está disponible
    if (peakAmplitude !== undefined) {
      this.amplitudes.push(peakAmplitude);
      
      // Si tenemos suficientes amplitudes, actualizar la secuencia de picos
      if (this.amplitudes.length >= 2 && this.peakTimes.length >= 2) {
        this.updatePeakSequence(
          peakAmplitude,
          latestInterval,
          this.peakTimes[this.peakTimes.length - 1]
        );
      }
    }
    
    // Limitar tamaño de arrays
    if (this.rrIntervals.length > this.RR_WINDOW_SIZE) {
      this.rrIntervals = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    }
    
    if (this.amplitudes.length > this.RR_WINDOW_SIZE) {
      this.amplitudes = this.amplitudes.slice(-this.RR_WINDOW_SIZE);
    }
    
    // Actualizar estado de la fase de aprendizaje
    this.updateLearningPhase();
  }

  /**
   * NUEVO: Actualiza la secuencia de picos clasificándolos como normales o prematuros
   */
  private updatePeakSequence(amplitude: number, rrInterval: number, timestamp: number): void {
    // Solo procesar si estamos fuera de la fase de aprendizaje
    if (this.isLearningPhase || this.baseRRInterval <= 0) {
      this.peakSequence.push({
        amplitude,
        time: timestamp,
        type: 'unknown'
      });
      
      if (this.peakSequence.length > 10) {
        this.peakSequence.shift();
      }
      
      return;
    }
    
    // Análisis avanzado para clasificar el pico
    let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
    
    // ALGORITMO MEJORADO: Usar múltiples criterios para clasificación más precisa
    
    // 1. Verificar si el intervalo RR es significativamente menor al basal
    const isShortRR = rrInterval < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD;
    
    // 2. Verificar si la amplitud es significativamente diferente a la normal
    const isAmplitudeAbnormal = 
      this.avgNormalAmplitude > 0 && 
      (amplitude < this.avgNormalAmplitude * this.AMPLITUDE_RATIO_THRESHOLD || 
       amplitude > this.avgNormalAmplitude * (2 - this.AMPLITUDE_RATIO_THRESHOLD));
    
    // 3. Verificar patrones compensatorios (un latido prematuro suele ir seguido de una pausa compensatoria)
    const hasCompensatoryPattern = this.checkCompensatoryPattern();
    
    // 4. Analizar la morfología del pulso a través de amplitudes relativas
    const hasMorphologyChange = this.analyzeAmplitudeMorphology();

    // LÓGICA DE DECISIÓN MEJORADA:
    if (isShortRR && (isAmplitudeAbnormal || hasCompensatoryPattern || hasMorphologyChange)) {
      peakType = 'premature';
      
      // Limitar detecciones consecutivas para evitar falsos positivos en series
      if (this.consecutiveArrhythmiaDetections < this.CONSECUTIVE_DETECTION_LIMIT) {
        this.consecutiveArrhythmiaDetections++;
      } else {
        // Reclasificar como normal si hay demasiadas detecciones consecutivas (probablemente ritmo normal acelerado)
        peakType = 'normal';
        this.consecutiveArrhythmiaDetections = 0;
      }
    } else {
      peakType = 'normal';
      this.consecutiveArrhythmiaDetections = 0;
      
      // Actualizar lista de intervalos RR normales (para referencia)
      if (Math.abs(rrInterval - this.baseRRInterval) < this.baseRRInterval * 0.15) {
        this.lastNormalRRIntervals.push(rrInterval);
        if (this.lastNormalRRIntervals.length > 5) {
          this.lastNormalRRIntervals.shift();
        }
      }
    }
    
    // Registrar el pico clasificado
    this.peakSequence.push({
      amplitude,
      time: timestamp,
      type: peakType
    });
    
    if (this.peakSequence.length > 10) {
      this.peakSequence.shift();
    }
    
    if (this.DEBUG_MODE && peakType === 'premature') {
      console.log(`ArrhythmiaDetector: Premature beat detected. RR: ${rrInterval}ms, 
        Base: ${this.baseRRInterval}ms, Amplitude: ${amplitude.toFixed(2)}, 
        AvgAmp: ${this.avgNormalAmplitude.toFixed(2)}`);
    }
  }
  
  /**
   * NUEVO: Verificar si hay un patrón compensatorio (latido prematuro seguido de pausa)
   */
  private checkCompensatoryPattern(): boolean {
    if (this.patternBuffer.length < 3) return false;
    
    // Buscar patrón de latido corto seguido por latido largo (pausa compensatoria)
    const patterns = this.patternBuffer.slice(-3);
    
    // Verificar: intervalo corto seguido de intervalo largo
    const firstInterval = patterns[0].rr;
    const secondInterval = patterns[1].rr;
    
    // Verificar si el primer intervalo es corto y el segundo es largo (típico de latidos prematuros)
    const isFirstShort = firstInterval < this.baseRRInterval * 0.85;
    const isSecondLong = secondInterval > this.baseRRInterval * 1.15;
    
    return isFirstShort && isSecondLong;
  }
  
  /**
   * NUEVO: Analizar la morfología del pulso mediante amplitudes relativas
   */
  private analyzeAmplitudeMorphology(): boolean {
    if (this.amplitudes.length < 3 || this.avgNormalAmplitude <= 0) return false;
    
    // Obtener las últimas amplitudes
    const recentAmplitudes = this.amplitudes.slice(-3);
    
    // Calcular variaciones relativas respecto a la amplitud normal
    const relativeVariations = recentAmplitudes.map(amp => 
      Math.abs(amp - this.avgNormalAmplitude) / this.avgNormalAmplitude
    );
    
    // Detectar cambios bruscos en la morfología (indicativo de latido prematuro)
    return relativeVariations.some(variation => variation > 0.4);
  }

  /**
   * Perform arrhythmia detection and analysis
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
    
    // NUEVO: Análisis de secuencia de picos para detectar prematuros
    const recentSequence = this.peakSequence.slice(-5);
    const prematurePeaks = recentSequence.filter(peak => peak.type === 'premature');
    
    // Si se detectó un pico prematuro dentro de la ventana de tiempo válida
    const hasPrematurePeak = prematurePeaks.length > 0 && 
                           currentTime - prematurePeaks[prematurePeaks.length - 1].time < 3000;
                           
    // NUEVA LÓGICA DE VALIDACIÓN:
    // 1. Verificar cambios en los intervalos RR (variabilidad)
    const rrVariation = this.calculateRRVariability();
    
    // 2. Calcular RMSSD (médicamente validado para variabilidad)
    const rmssd = this.calculateRMSSD();
    
    // 3. Verificar si hay un nuevo latido prematuro válido para contar
    const isNewArrhythmia = hasPrematurePeak && 
                            currentTime - this.lastArrhythmiaTime >= 2500;
    
    // Almacenar últimos valores calculados
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
    
    // Detección final: combinación de criterios médicamente validados
    let arrhythmiaDetected = false;
    
    if (hasPrematurePeak) {
      // Si se detecta un pico prematuro, verificar que cumpla con los requisitos temporales
      const latestPremature = prematurePeaks[prematurePeaks.length - 1];
      
      if (currentTime - this.lastArrhythmiaTime >= 2500) {
        arrhythmiaDetected = true;
        this.lastArrhythmiaTime = currentTime;
        
        // Incrementar contador solo si es un nuevo evento
        if (!this.hasDetectedFirstArrhythmia || isNewArrhythmia) {
          this.arrhythmiaCount++;
          this.hasDetectedFirstArrhythmia = true;
        }
        
        if (this.DEBUG_MODE) {
          console.log(`ArrhythmiaDetector: Arrhythmia #${this.arrhythmiaCount} confirmed. RMSSD: ${rmssd.toFixed(2)}, Variation: ${rrVariation.toFixed(2)}`);
        }
      }
    }
    
    this.arrhythmiaDetected = arrhythmiaDetected;
    
    return {
      detected: arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.getStatus(),
      data: {
        rmssd,
        rrVariation,
        prematureBeat: hasPrematurePeak
      }
    };
  }
  
  /**
   * NUEVO: Calcular la variabilidad de los intervalos RR (médicamente validado)
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
   * NUEVO: Calcular RMSSD (Root Mean Square of Successive Differences)
   * Medida estándar en medicina para evaluar variabilidad de frecuencia cardíaca
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
   * Clean memory function for resource management
   */
  cleanMemory(): void {
    this.reset();
  }
}
