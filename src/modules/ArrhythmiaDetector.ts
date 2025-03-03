/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 6000; // Aumentado para mejor calibración
  
  // OPTIMIZAR SENSIBILIDAD: Umbrales refinados basados en investigación cardiológica
  private readonly PREMATURE_BEAT_THRESHOLD = 0.65; // Más restrictivo para reducir falsos positivos
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.80; // Umbral ajustado para identificar mejor picos prematuros
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.60; // Umbral más alto para picos normales
  
  // Estado de detección mejorado
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Almacenar amplitudes para detectar picos pequeños
  private peakTimes: number[] = []; // Almacenar tiempos exactos de cada pico
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
  private baseRRInterval: number = 0; // Intervalo RR normal de referencia
  
  // NUEVO: Almacenamiento de secuencia de picos para análisis preciso
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
    rr?: number; // Intervalo RR asociado con este pico
  }> = [];
  
  // NUEVO: Control mejorado de falsos positivos
  private consecNormalBeats: number = 0;
  private readonly MIN_NORMAL_BEATS_BEFORE_DETECTION = 5; // Requiere estabilidad antes de detectar arritmias
  private readonly MIN_RR_VARIATION_FOR_PREMATURE = 0.20; // El intervalo RR debe ser al menos 20% más corto
  private readonly MAX_PREMATURE_INTERVAL_MS = 5000; // Tiempo máximo entre arritmias para ser consideradas como distintas
  
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
    this.consecNormalBeats = 0;
    
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
          // Usar una mediana ponderada para obtener la amplitud normal de referencia
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          
          // Usar el tercio superior como referencia para la amplitud normal
          const normalCount = Math.max(3, Math.ceil(sortedAmplitudes.length * 0.33));
          const topAmplitudes = sortedAmplitudes.slice(0, normalCount);
          this.avgNormalAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
          
          console.log('ArrhythmiaDetector - Amplitud normal de referencia CALIBRADA:', {
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
          
          console.log('ArrhythmiaDetector - Intervalo RR normal CALIBRADO:', {
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
    
    // Guardar datos válidos
    if (intervals.length > 0) {
      // FILTRAR: Solo usar intervalos válidos para cardiodetección
      const validIntervals = intervals.filter(interval => 
        interval >= 300 && interval <= 2000 // Valores médicamente válidos (30-200 BPM)
      );
      
      if (validIntervals.length > 0) {
        this.rrIntervals = validIntervals;
      }
    }
    
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
      // Guardar amplitud absoluta para comparaciones más estables
      const absAmplitude = Math.abs(peakAmplitude);
      this.amplitudes.push(absAmplitude);
      
      // NUEVO: Calcular intervalo RR entre picos
      let currentRR = 0;
      if (this.peakSequence.length > 0) {
        const lastPeakEntry = this.peakSequence[this.peakSequence.length - 1];
        currentRR = currentTime - lastPeakEntry.time;
      }
      
      // Actualizar la secuencia de picos con el nuevo pico
      if (lastPeakTime) {
        // Clasificación inicial como desconocido
        let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
        
        // Si ya tenemos amplitud de referencia, podemos clasificar
        if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
          const ratio = absAmplitude / this.avgNormalAmplitude;
          
          // Clasificar como normal si está cerca o por encima del promedio normal
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            peakType = 'normal';
            this.consecNormalBeats++;
          } 
          // Clasificar como prematuro si es significativamente más pequeño
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
            peakType = 'premature';
            this.consecNormalBeats = 0;
          } else {
            // Incertidumbre - no clasificable claramente
            this.consecNormalBeats = 0; 
          }
        }
        
        this.peakSequence.push({
          amplitude: absAmplitude,
          time: currentTime,
          type: peakType,
          rr: currentRR > 0 ? currentRR : undefined
        });
        
        // Mantener solo los últimos 10 picos para análisis
        if (this.peakSequence.length > 10) {
          this.peakSequence.shift();
        }
      }
      
      // Mantener amplitudes sincronizadas con intervalos
      if (this.amplitudes.length > this.rrIntervals.length + 5) {
        this.amplitudes = this.amplitudes.slice(-(this.rrIntervals.length + 5));
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * ALGORITMO MEJORADO: Detecta SOLO latidos prematuros PEQUEÑOS entre dos latidos NORMALES
   * con validación avanzada de patrón y control de falsos positivos
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Datos insuficientes o fase de aprendizaje
    if (this.rrIntervals.length < 4 || this.amplitudes.length < 4 || this.peakSequence.length < 4) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Si todavía estamos en fase de aprendizaje, no detectar arritmias
    if (this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `CALIBRANDO|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calculate RMSSD for evaluación clínica
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    // ALGORITMO DE ALTA PRECISIÓN:
    // 1. Verificar estabilidad previa (suficientes latidos normales)
    // 2. Buscar patrón específico: NORMAL - PEQUEÑO - NORMAL
    // 3. Validar con criterios temporales y de amplitud
    
    let prematureBeatDetected = false;
    
    // Primera validación: Requerir suficientes latidos normales antes 
    // de permitir la detección, para evitar falsos positivos durante la 
    // estabilización inicial
    if (this.consecNormalBeats < this.MIN_NORMAL_BEATS_BEFORE_DETECTION && 
        !this.hasDetectedFirstArrhythmia) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: { rmssd, rrVariation: 0, prematureBeat: false }
      };
    }
    
    // ALGORITMO ESTRICTO: Buscar el patrón específico de latido prematuro entre normales
    if (this.peakSequence.length >= 4 && this.avgNormalAmplitude > 0) {
      // Verificamos los últimos picos para buscar el patrón (usamos 4 para mejor contexto)
      const lastPeaks = this.peakSequence.slice(-4);
      
      // Re-clasificar los picos explícitamente para análisis actual
      for (let i = 0; i < lastPeaks.length; i++) {
        const peak = lastPeaks[i];
        const ratio = peak.amplitude / this.avgNormalAmplitude;
        
        // Clasificación precisa basada en amplitud
        if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          lastPeaks[i].type = 'normal';
        } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
          lastPeaks[i].type = 'premature';
        } else {
          lastPeaks[i].type = 'unknown';
        }
      }
      
      // Buscar el patrón normal-prematuro-normal (usando índices desde el final)
      // Podemos verificar con 3 picos (clásico) o con 4 para mejor contexto
      let patternDetected = false;
      
      // Verificar patrón clásico N-P-N en los últimos 3 picos
      if (
        lastPeaks[lastPeaks.length-3].type === 'normal' && 
        lastPeaks[lastPeaks.length-2].type === 'premature' && 
        lastPeaks[lastPeaks.length-1].type === 'normal'
      ) {
        patternDetected = true;
      }
      
      // Verificar patrón N-P-N en posición -4, -3, -2 (con pico normal adicional al final)
      else if (
        lastPeaks.length >= 4 &&
        lastPeaks[lastPeaks.length-4].type === 'normal' && 
        lastPeaks[lastPeaks.length-3].type === 'premature' && 
        lastPeaks[lastPeaks.length-2].type === 'normal' &&
        lastPeaks[lastPeaks.length-1].type === 'normal'
      ) {
        patternDetected = true;
      }
      
      if (patternDetected) {
        // Obtener los 3 picos que forman el patrón (podemos estar en cualquiera de los dos casos)
        const patternStartIdx = 
          lastPeaks[lastPeaks.length-3].type === 'premature' ? 
          lastPeaks.length-4 : lastPeaks.length-3;
        
        const normal1 = lastPeaks[patternStartIdx];
        const premature = lastPeaks[patternStartIdx + 1];
        const normal2 = lastPeaks[patternStartIdx + 2];
        
        // Calcular ratios para validación estricta
        const normal1Ratio = normal1.amplitude / this.avgNormalAmplitude;
        const prematureRatio = premature.amplitude / this.avgNormalAmplitude;
        const normal2Ratio = normal2.amplitude / this.avgNormalAmplitude;
        
        // Validación avanzada: verificar criterios de amplitud estrictos
        if (
          // El pico prematuro debe ser significativamente más pequeño
          prematureRatio <= this.AMPLITUDE_RATIO_THRESHOLD && 
          // Los picos normales deben ser suficientemente grandes
          normal1Ratio >= this.NORMAL_PEAK_MIN_THRESHOLD && 
          normal2Ratio >= this.NORMAL_PEAK_MIN_THRESHOLD &&
          // El pico prematuro debe ser al menos 20% más pequeño que el promedio de los normales
          prematureRatio <= (normal1Ratio + normal2Ratio) / 2 * 0.8
        ) {
          // Validación adicional: verificar criterios temporales
          if (
            // Tenemos datos de intervalos RR
            premature.rr !== undefined && normal2.rr !== undefined &&
            // El intervalo del latido prematuro debe ser más corto que el normal
            this.baseRRInterval > 0 &&
            // El intervalo debe ser al menos 20% más corto que el normal
            premature.rr <= this.baseRRInterval * (1 - this.MIN_RR_VARIATION_FOR_PREMATURE)
          ) {
            prematureBeatDetected = true;
            
            if (this.DEBUG_MODE) {
              console.log('ArrhythmiaDetector - ¡LATIDO PREMATURO VALIDADO!', {
                prematuroRatio: prematureRatio,
                normal1Ratio: normal1Ratio,
                normal2Ratio: normal2Ratio,
                prematuroRR: premature.rr,
                baseRR: this.baseRRInterval,
                rrRatio: premature.rr / this.baseRRInterval
              });
            }
          } else {
            // No cumple criterios temporales
            if (this.DEBUG_MODE) {
              console.log('ArrhythmiaDetector - Patrón de amplitud correcto, pero NO cumple criterios temporales:', {
                prematuroRR: premature.rr,
                normal2RR: normal2.rr,
                baseRR: this.baseRRInterval,
                umbralRR: this.MIN_RR_VARIATION_FOR_PREMATURE
              });
            }
          }
        } else {
          // No cumple criterios de amplitud estrictos
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Patrón detectado, pero NO cumple criterios estrictos de amplitud:', {
              prematuroRatio: prematureRatio,
              normal1Ratio: normal1Ratio,
              normal2Ratio: normal2Ratio,
              criterio1: prematureRatio <= this.AMPLITUDE_RATIO_THRESHOLD,
              criterio2: normal1Ratio >= this.NORMAL_PEAK_MIN_THRESHOLD, 
              criterio3: normal2Ratio >= this.NORMAL_PEAK_MIN_THRESHOLD,
              criterio4: prematureRatio <= (normal1Ratio + normal2Ratio) / 2 * 0.8
            });
          }
        }
      }
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // EVITAR DUPLICADOS: Solo contar arritmias nuevas si ha pasado suficiente tiempo desde la última
    if (prematureBeatDetected && 
        currentTime - this.lastArrhythmiaTime > this.MAX_PREMATURE_INTERVAL_MS) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - NUEVA ARRITMIA CONTABILIZADA:', {
          count: this.arrhythmiaCount,
          timestamp: currentTime
        });
      }
    }

    this.arrhythmiaDetected = prematureBeatDetected;

    return {
      detected: this.arrhythmiaDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { rmssd, rrVariation, prematureBeat: prematureBeatDetected }
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
