
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
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 2500; // Slightly increased from 2000ms to allow more learning
  
  // Enfoque mejorado para detectar SOLO latidos prematuros fuera del patrón rítmico
  private readonly PREMATURE_BEAT_THRESHOLD = 0.70; // Ajustado para ser menos estricto
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.60; // Ligeramente más permisivo para amplitudes pequeñas
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.85; // Mantener umbral para considerar un pico como normal
  
  // NUEVO: Umbral para detectar latidos fuera del patrón rítmico aprendido
  private readonly RHYTHM_DEVIATION_THRESHOLD = 0.25; // Desviación de 25% del patrón rítmico

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
  
  // NUEVO: Almacenamiento del patrón rítmico aprendido
  private rhythmPattern: number[] = [];
  private expectedNextBeatTime: number = 0;
  
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
    this.rhythmPattern = [];
    this.expectedNextBeatTime = 0;
    
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
          
          // NUEVO: Aprender el patrón rítmico de los últimos intervalos
          this.learnRhythmPattern();
          
          console.log('ArrhythmiaDetector - Intervalo RR normal:', {
            baseRRInterval: this.baseRRInterval,
            totalSamples: this.rrIntervals.length,
            rhythmPattern: this.rhythmPattern
          });
        }
      }
    }
  }

  /**
   * NUEVO: Aprender el patrón rítmico basado en los intervalos RR
   */
  private learnRhythmPattern(): void {
    if (this.rrIntervals.length < 4) return;
    
    // Usar los últimos 4 intervalos que no sean demasiado diferentes entre sí
    const lastIntervals = this.rrIntervals.slice(-4);
    const avgInterval = lastIntervals.reduce((sum, val) => sum + val, 0) / lastIntervals.length;
    
    // Filtrar solo intervalos que no se desvíen más del 20% de la media
    const normalIntervals = lastIntervals.filter(interval => 
      Math.abs(interval - avgInterval) / avgInterval < 0.2
    );
    
    if (normalIntervals.length >= 3) {
      this.rhythmPattern = [...normalIntervals];
      
      // Si tenemos tiempos de pico, calcular cuándo esperamos el próximo
      if (this.lastPeakTime && this.rhythmPattern.length > 0) {
        const nextExpectedInterval = this.rhythmPattern[this.rhythmPattern.length - 1];
        this.expectedNextBeatTime = this.lastPeakTime + nextExpectedInterval;
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
    
    // NUEVO: Actualizar el tiempo esperado del próximo latido
    if (lastPeakTime && this.rhythmPattern.length > 0 && !this.isLearningPhase) {
      // Calcular cuál sería el próximo intervalo esperado basado en el patrón rítmico
      const patternIndex = this.peakTimes.length % this.rhythmPattern.length;
      const expectedInterval = this.rhythmPattern[patternIndex];
      
      // Actualizar el tiempo esperado del próximo latido
      this.expectedNextBeatTime = lastPeakTime + expectedInterval;
    }
    
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
   * ALGORITMO MEJORADO: Detecta SOLO latidos prematuros que rompen el patrón rítmico aprendido
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
    
    // ALGORITMO MEJORADO: Buscar latidos que rompan el patrón rítmico aprendido
    let prematureBeatDetected = false;
    
    // NUEVO: Verificar si el último latido ocurrió muy temprano respecto al patrón rítmico
    if (this.lastPeakTime && this.expectedNextBeatTime > 0 && this.peakSequence.length >= 3) {
      // Si el latido ocurrió antes de lo esperado (prematuramente) por un margen significativo
      const timeDifference = this.lastPeakTime - this.expectedNextBeatTime;
      const relativeDeviation = Math.abs(timeDifference) / this.baseRRInterval;
      
      // Considerar prematuro si ocurrió significativamente antes de lo esperado
      // según el umbral de desviación rítmica
      if (timeDifference < 0 && relativeDeviation > this.RHYTHM_DEVIATION_THRESHOLD) {
        // Verificar también si su amplitud es menor (característica de extrasístoles)
        const lastPeak = this.peakSequence[this.peakSequence.length - 1];
        const previousPeak = this.peakSequence[this.peakSequence.length - 2];
        
        if (lastPeak.amplitude < previousPeak.amplitude * this.AMPLITUDE_RATIO_THRESHOLD) {
          prematureBeatDetected = true;
          
          console.log('ArrhythmiaDetector - Latido prematuro detectado por patrón rítmico:', {
            esperado: this.expectedNextBeatTime,
            actual: this.lastPeakTime,
            desviación: relativeDeviation,
            umbral: this.RHYTHM_DEVIATION_THRESHOLD,
            amplitudRelativa: lastPeak.amplitude / previousPeak.amplitude
          });
        }
      }
    }
    
    // PATRÓN CLÁSICO: Un pico pequeño (prematuro) entre dos picos normales
    if (!prematureBeatDetected && this.peakSequence.length >= 3) {
      const lastThreePeaks = this.peakSequence.slice(-3);
      
      // Clasificar los picos explícitamente
      for (let i = 0; i < lastThreePeaks.length; i++) {
        const peak = lastThreePeaks[i];
        const ratio = peak.amplitude / this.avgNormalAmplitude;
        
        // Clasificar el pico basado en su amplitud
        if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          lastThreePeaks[i].type = 'normal';
        } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
          lastThreePeaks[i].type = 'premature';
        } else {
          lastThreePeaks[i].type = 'unknown';
        }
      }
      
      // Verificar patrón normal-premature-normal
      if (
        lastThreePeaks[0].type === 'normal' && 
        lastThreePeaks[1].type === 'premature' && 
        lastThreePeaks[2].type === 'normal'
      ) {
        // Para más seguridad, verificar que las amplitudes relativas cumplan lo esperado
        const firstPeakRatio = lastThreePeaks[0].amplitude / this.avgNormalAmplitude;
        const secondPeakRatio = lastThreePeaks[1].amplitude / this.avgNormalAmplitude;
        const thirdPeakRatio = lastThreePeaks[2].amplitude / this.avgNormalAmplitude;
        
        if (secondPeakRatio <= this.AMPLITUDE_RATIO_THRESHOLD && 
            firstPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD && 
            thirdPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          
          prematureBeatDetected = true;
          
          console.log('ArrhythmiaDetector - ¡LATIDO PREMATURO DETECTADO! Patrón normal-pequeño-normal:', {
            prematuroRatio: secondPeakRatio,
            normal1Ratio: firstPeakRatio,
            normal2Ratio: thirdPeakRatio,
            umbralPequeno: this.AMPLITUDE_RATIO_THRESHOLD,
            umbralNormal: this.NORMAL_PEAK_MIN_THRESHOLD
          });
        }
      }
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // Solo contar arritmias si suficiente tiempo desde la última (500ms) para evitar duplicados
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 500) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      // NUEVO: Actualizar el patrón rítmico después de cada arritmia para adaptarse
      if (this.rrIntervals.length >= 4) {
        this.learnRhythmPattern();
      }
      
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
