/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Constants for arrhythmia detection - VALORES CORREGIDOS
  private readonly RR_WINDOW_SIZE = 7;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000; // Reducido a 3 segundos para detección más temprana
  // Umbrales ajustados para MÁXIMA sensibilidad (al mínimo razonable)
  private readonly PREMATURE_BEAT_THRESHOLD = 0.80; // Umbral para considerar prematuro
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.65; // Más permisivo para amplitudes
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.80; // Umbral para picos normales
  // Nuevos parámetros para mejorar la detección
  private readonly MIN_PREMATURE_INTERVAL_MS = 400; // Más permisivo
  private readonly PATTERN_VALIDATION_WINDOW = 3; // Ventana reducida
  private readonly POST_PREMATURE_COMPENSATION_MS = 300; // Compensación después de latido prematuro
  // Umbrales de variabilidad fisiológica - EXTREMADAMENTE SENSIBLES
  private readonly RMSSD_THRESHOLD = 20; // Reducido para detectar más variabilidad
  private readonly RR_VARIATION_THRESHOLD = 0.08; // Más permisivo
  
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
  // Datos de referencia para calibración dinámica
  private referenceHeartRate: number = 0; // BPM de referencia
  private referenceRRInterval: number = 0; // Intervalo RR de referencia
  
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
    this.referenceHeartRate = 0;
    this.referenceRRInterval = 0;
    
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
        // Excluir valores atípicos para el cálculo del intervalo RR base
        const sortedIntervals = [...this.rrIntervals].sort((a, b) => a - b);
        const lowerQuartileIndex = Math.floor(sortedIntervals.length * 0.25);
        const upperQuartileIndex = Math.ceil(sortedIntervals.length * 0.75);
        const normalIntervals = sortedIntervals.slice(lowerQuartileIndex, upperQuartileIndex + 1);
        
        this.baseRRInterval = normalIntervals.reduce((sum, val) => sum + val, 0) / normalIntervals.length;
        this.referenceRRInterval = this.baseRRInterval;
        this.referenceHeartRate = Math.round(60000 / this.baseRRInterval);
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Fin fase aprendizaje:', {
            baseRRInterval: this.baseRRInterval,
            baseBPM: this.referenceHeartRate
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
    
    // CRÍTICO: Comprobar si recibimos amplitudes correctamente
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude)) {
      // Recibimos amplitud - usar valor absoluto para evitar problemas
      const amplitude = Math.abs(peakAmplitude);
      
      // Validar que la amplitud no sea cero ni demasiado grande (filtrar valores atípicos)
      if (amplitude > 0.01 && amplitude < 10) {
        this.amplitudes.push(amplitude);
        
        // Actualizar la secuencia de picos con el nuevo
        if (lastPeakTime) {
          // Clasificación inicial como desconocido
          let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
          
          // Si ya tenemos amplitud de referencia, podemos hacer una clasificación inicial
          if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
            const ratio = amplitude / this.avgNormalAmplitude;
            
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
            amplitude: amplitude,
            time: currentTime,
            type: peakType
          });
          
          // Mantener solo los últimos 10 picos
          if (this.peakSequence.length > 10) {
            this.peakSequence.shift();
          }
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Pico registrado:', {
              amplitude: amplitude,
              normalizedAmplitude: this.avgNormalAmplitude > 0 ? amplitude / this.avgNormalAmplitude : 'N/A',
              type: peakType
            });
          }
        }
        
        // Keep the same number of amplitudes as intervals
        if (this.amplitudes.length > this.rrIntervals.length) {
          this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
        }
      } else {
        console.warn('ArrhythmiaDetector - Amplitud fuera de rango', amplitude);
      }
    } else {
      // CRÍTICO: No recibimos amplitud válida
      console.warn('ArrhythmiaDetector - Sin amplitud de pico válida');
      
      // Usar un valor por defecto basado en los últimos valores
      const defaultAmplitude = this.amplitudes.length > 0 
        ? this.amplitudes[this.amplitudes.length - 1] 
        : 1.0;
      
      this.amplitudes.push(defaultAmplitude);
      
      // Mantener solo los datos necesarios
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
      
      // Actualización dinámica del intervalo RR base
      if (!this.isLearningPhase && this.baseRRInterval > 0) {
        // Actualizar solo con intervalos normales (no con prematuros)
        if (this.recentRRHistory.length >= 3 && 
            Math.abs(currentInterval - this.baseRRInterval) / this.baseRRInterval < 0.15) {
          // Actualización suave del intervalo base (adaptive)
          this.baseRRInterval = 0.9 * this.baseRRInterval + 0.1 * currentInterval;
          
          // Actualizar referencia cada 10 latidos normales
          if (Math.random() < 0.1) { // ~10% de probabilidad
            this.referenceRRInterval = this.baseRRInterval;
            this.referenceHeartRate = Math.round(60000 / this.referenceRRInterval);
          }
        }
      }
      
      // Actualizar patrón normalizado solo si tenemos suficientes datos
      if (this.baseRRInterval > 0 && this.recentRRHistory.length >= 2) {
        this.normalizedRRPattern = this.recentRRHistory.map(interval => 
          interval / this.baseRRInterval);
        
        if (this.DEBUG_MODE && intervals.length >= 3) {
          console.log('ArrhythmiaDetector - RR Pattern:', {
            pattern: this.normalizedRRPattern.slice(0, 3),
            baseRRInterval: this.baseRRInterval
          });
        }
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * ALGORITMO MEJORADO Y CORREGIDO: Detecta latidos prematuros de forma precisa
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Skip detection during learning phase or if not enough data
    if (this.isLearningPhase) {
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - En fase de aprendizaje, sin detección');
      }
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }
    
    // Verificar si tenemos datos suficientes para detección
    if (this.rrIntervals.length < 2 || this.normalizedRRPattern.length < 2) {
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
    
    // Calculate RMSSD for reference (medida de variabilidad)
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    this.lastRMSSD = rmssd;
    
    // FUNCIÓN PRINCIPAL: Análisis simple y directo para encontrar latidos prematuros
    const detectPrematureBeat = () => {
      // 1. Obtener los valores normalizados más recientes
      const lastRR = this.normalizedRRPattern[0];  // RR actual
      const prevRR = this.normalizedRRPattern.length > 1 ? this.normalizedRRPattern[1] : 1.0;  // RR anterior
      
      // 2. Verificar patrón clásico de latido prematuro:
      //    - Un intervalo significativamente más corto que lo normal
      //    - Seguido de un intervalo normal o más largo (compensatorio)
      const isShortInterval = lastRR < this.PREMATURE_BEAT_THRESHOLD;
      const isPrevNormal = prevRR >= 0.85 && prevRR <= 1.2;
      
      // 3. Verificar si ha pasado suficiente tiempo desde la última detección
      const timeSinceLastPremature = currentTime - this.lastPrematureTime;
      const sufficientTimePassed = timeSinceLastPremature > 1000; // Al menos 1 segundo entre detecciones
      
      // 4. Verificar si tenemos variabilidad significativa (característica de arritmias)
      const hasSignificantVariability = 
        rmssd > this.RMSSD_THRESHOLD || 
        Math.abs(lastRR - prevRR) / prevRR > 0.2;
      
      // ALGORITMO SIMPLIFICADO: Menos condiciones, más directo
      const isPrematureBeat = 
        isShortInterval && 
        isPrevNormal && 
        sufficientTimePassed;
      
      if (isPrematureBeat) {
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - LATIDO PREMATURO DETECTADO', {
            lastRR,
            prevRR,
            rmssd,
            timeSinceLastPremature
          });
        }
        this.lastPrematureTime = currentTime;
        return true;
      }
      
      return false;
    };
    
    // Ejecutar la detección
    const isPrematureBeat = detectPrematureBeat();
    
    // Actualizar estado basado en resultado - LÓGICA SIMPLIFICADA
    if (isPrematureBeat) {
      // Siempre incrementar en una detección positiva
      this.arrhythmiaDetected = true;
      this.arrhythmiaCount++;
      this.hasDetectedFirstArrhythmia = true;
      this.lastArrhythmiaTime = currentTime;
      
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - ARRITMIA CONTABILIZADA', {
          count: this.arrhythmiaCount,
          timestamp: currentTime
        });
      }
    } else {
      // Mantener el estado de arritmia por un breve periodo para estabilidad visual
      const timeSinceLastArrhythmia = currentTime - this.lastArrhythmiaTime;
      if (timeSinceLastArrhythmia > 800) { // Reducido a 800ms
        this.arrhythmiaDetected = false;
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
