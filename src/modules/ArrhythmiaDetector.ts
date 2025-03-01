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
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 5000; // Reducido aún más para detectar antes
  
  // AUMENTAR SENSIBILIDAD: Ajustes para detectar más latidos prematuros
  private readonly PREMATURE_BEAT_THRESHOLD = 0.70; // Más estricto, era 0.60
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.75; // Umbral más restrictivo para capturar solo picos pequeños genuinos
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.80; // Umbral más estricto para considerar un pico como normal
  
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
          // MEJORA: Filtrado más robusto para obtener amplitudes normales reales
          // 1. Ordenar amplitudes de mayor a menor 
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          
          // 2. Eliminar valores extremos (outliers) - 10% superior e inferior
          const cutSize = Math.max(1, Math.floor(sortedAmplitudes.length * 0.1));
          const filteredAmplitudes = sortedAmplitudes.slice(cutSize, sortedAmplitudes.length - cutSize);
          
          // 3. Usar una ventana centrada en la mediana para valores más consistentes
          const medianIndex = Math.floor(filteredAmplitudes.length / 2);
          const medianWindow = filteredAmplitudes.slice(
            Math.max(0, medianIndex - 2), 
            Math.min(filteredAmplitudes.length, medianIndex + 3)
          );
          
          // 4. Calcular la media recortada como referencia de amplitud normal
          this.avgNormalAmplitude = medianWindow.reduce((a, b) => a + b, 0) / medianWindow.length;
          
          console.log('ArrhythmiaDetector - Amplitud normal de referencia MEJORADA:', {
            avgNormalAmplitude: this.avgNormalAmplitude,
            totalSamples: this.amplitudes.length,
            medianValues: medianWindow,
            filteredTotal: filteredAmplitudes.length
          });
        }
        
        // Calcular intervalo RR normal de referencia con mayor precisión
        if (this.rrIntervals.length > 5) {
          // 1. Ordenar intervalos RR
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // 2. Eliminar outliers más agresivamente (15% superior e inferior)
          const cutSize = Math.max(1, Math.floor(sortedRR.length * 0.15));
          const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
          
          // 3. Calcular la mediana como referencia del intervalo normal
          const medianIndex = Math.floor(filteredRR.length / 2);
          this.baseRRInterval = filteredRR[medianIndex];
          
          // 4. Establecer límites estrictos para la detección
          const minValidRR = this.baseRRInterval * 0.7;  // 70% del intervalo normal
          const maxValidRR = this.baseRRInterval * 1.3;  // 130% del intervalo normal
          
          console.log('ArrhythmiaDetector - Intervalo RR normal MEJORADO:', {
            baseRRInterval: this.baseRRInterval,
            minValidRR,
            maxValidRR,
            medianRR: filteredRR[medianIndex],
            totalSamples: this.rrIntervals.length,
            filteredSamples: filteredRR.length
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
    if (this.rrIntervals.length < 3 || this.amplitudes.length < 3) {
      console.log("ArrhythmiaDetector - Datos insuficientes para detección", {
        rrIntervals: this.rrIntervals.length,
        amplitudes: this.amplitudes.length,
        isLearning: this.isLearningPhase
      });
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
      console.log("ArrhythmiaDetector - En fase de aprendizaje, calibrando...");
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `CALIBRANDO|${this.arrhythmiaCount}`,
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
    
    // ALGORITMO SIMPLIFICADO Y ESPECÍFICO:
    // 1. Solo trabajamos con la secuencia de picos (amplitudes y tiempos)
    // 2. Buscamos un patrón específico: NORMAL - PEQUEÑO - NORMAL
    
    let prematureBeatDetected = false;
    
    // ALGORITMO ESTRICTO: Buscar el patrón específico de latido prematuro entre normales
    if (this.peakSequence.length >= 3 && this.avgNormalAmplitude > 0) {
      // Verificamos los 3 últimos picos 
      const lastThreePeaks = this.peakSequence.slice(-3);
      
      // Clasificar los picos explícitamente
      for (let i = 0; i < lastThreePeaks.length; i++) {
        const peak = lastThreePeaks[i];
        const ratio = peak.amplitude / this.avgNormalAmplitude;
        
        // Clasificar el pico basado en su amplitud - con criterios más estrictos
        if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          lastThreePeaks[i].type = 'normal';
        } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
          lastThreePeaks[i].type = 'premature';
        } else {
          lastThreePeaks[i].type = 'unknown';
        }
      }
      
      // PATRÓN ESTRICTO: Un pico pequeño (prematuro) entre dos picos normales
      if (
        lastThreePeaks[0].type === 'normal' && 
        lastThreePeaks[1].type === 'premature' && 
        lastThreePeaks[2].type === 'normal'
      ) {
        // ANÁLISIS DE INTERVALOS RR: Un latido prematuro tiene intervalos RR característicos
        // El intervalo antes del latido prematuro debe ser más corto que el normal
        // El intervalo después del latido prematuro debe ser más largo (pausa compensatoria)
        let intervalCheck = false;
        
        if (lastThreePeaks.length >= 3 && this.baseRRInterval > 0) {
          // Calcular intervalos entre picos
          const interval1 = lastThreePeaks[1].time - lastThreePeaks[0].time;
          const interval2 = lastThreePeaks[2].time - lastThreePeaks[1].time;
          
          // Proporción respecto al intervalo normal
          const interval1Ratio = interval1 / this.baseRRInterval;
          const interval2Ratio = interval2 / this.baseRRInterval;
          
          // Verificar patrón típico: primer intervalo más corto, segundo más largo
          const isPrematuroPattern = interval1Ratio < 0.85 && interval2Ratio > 1.15;
          
          intervalCheck = isPrematuroPattern;
          
          console.log('ArrhythmiaDetector - Análisis de intervalos RR:', {
            interval1, 
            interval2, 
            baseInterval: this.baseRRInterval,
            interval1Ratio, 
            interval2Ratio,
            isPrematuroPattern
          });
        }
        
        // Para confirmar un latido prematuro, debe cumplir TANTO el patrón de amplitud como el de intervalos
        prematureBeatDetected = intervalCheck;
      } else {
        // Información de depuración
        console.log('ArrhythmiaDetector - No se encontró patrón normal-pequeño-normal:', 
          lastThreePeaks.map(p => ({
            type: p.type,
            ratio: p.amplitude / this.avgNormalAmplitude
          }))
        );
      }
    } else {
      console.log('ArrhythmiaDetector - No hay suficientes picos o amplitud de referencia:', {
        peakCount: this.peakSequence.length,
        avgNormalAmplitude: this.avgNormalAmplitude
      });
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // Solo contar arritmias si suficiente tiempo desde la última (300ms) para evitar duplicados
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 300) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
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
