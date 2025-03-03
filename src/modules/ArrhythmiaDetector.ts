
/**
 * ArrhythmiaDetector.ts
 * 
 * Detector especializado exclusivamente en identificar latidos prematuros reales
 * desde señales PPG con máxima precisión y mínimos falsos positivos.
 */

export class ArrhythmiaDetector {
  // Periodo de aprendizaje mejorado - exactamente 5 segundos como solicitado
  private readonly LEARNING_PERIOD = 5000; // 5 segundos exactos
  private readonly RR_WINDOW_SIZE = 8; // Aumentado para mejor análisis de patrones
  
  // Umbrales más restrictivos enfocados específicamente en patrones de latidos prematuros
  private readonly PREMATURE_BEAT_THRESHOLD = 0.72; // Más restrictivo (de 0.65 a 0.72)
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.68; // Más restrictivo (de 0.60 a 0.68)
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.94; // Umbral superior para latidos normales (de 0.92 a 0.94)
  
  // Umbral de desviación del ritmo específicamente para tiempos de latidos prematuros
  private readonly RHYTHM_DEVIATION_THRESHOLD = 0.42; // Más restrictivo (de 0.35 a 0.42)
  
  // Confianza mínima superior para detección para reducir falsos positivos
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.92; // Aumentado de 0.90 a 0.92 para mayor precisión
  
  // Tiempo de enfriamiento entre detecciones para evitar múltiples detecciones del mismo evento
  private readonly DETECTION_COOLDOWN = 1200; // Aumentado de 800ms a 1200ms (más tiempo entre detecciones)
  
  // Latidos normales consecutivos mínimos antes de considerar detección de latido prematuro
  private readonly MIN_NORMAL_BEATS_SEQUENCE = 4; // Aumentado de 3 a 4 para mayor estabilidad
  
  // Intervalo RR mínimo para un latido válido (previene secuencias ultra-rápidas)
  private readonly MIN_VALID_RR_INTERVAL = 550; // 550ms (límite máximo ~109 BPM)
  
  // Variación RR máxima que puede considerarse variación normal
  private readonly MAX_NORMAL_RR_VARIATION = 0.12; // Reducido de 0.15 a 0.12 (12% de variación aún es normal)
  
  // Número mínimo de latidos para establecer un patrón rítmico
  private readonly MIN_BEATS_FOR_RHYTHM = 5; // Mínimo de 5 latidos para establecer un patrón confiable

  // Variables de estado
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Almacenar amplitudes para detectar latidos pequeños
  private peakTimes: number[] = []; // Almacenar tiempos exactos de cada pico
  private isLearningPhase = true;
  private arrhythmiaDetected = false;
  private arrhythmiaCount = 0;
  private measurementStartTime: number = Date.now();
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;
  private avgNormalAmplitude: number = 0;
  private baseRRInterval: number = 0; // Intervalo RR normal promedio
  
  // Aprendizaje de patrones rítmicos
  private rhythmPatterns: number[][] = []; // Múltiples patrones para mejor reconocimiento
  private expectedNextBeatTime: number = 0;
  private rhythmVariability: number = 0; // Nueva: variabilidad natural del ritmo del usuario
  
  // Seguimiento de secuencias para reconocimiento de patrones
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    interval: number;
    type: 'normal' | 'premature' | 'unknown';
  }> = [];
  
  // Seguimiento de estabilidad
  private consecutiveNormalBeats: number = 0;
  private patternConfidence: number = 0; // Nueva: confianza en el patrón aprendido
  
  // Historial para análisis avanzado
  private recentRRHistory: number[] = []; // Historial reciente para análisis de tendencias
  private normalRRHistory: number[] = []; // Solo intervalos RR normales confirmados
  
  // Modo de depuración para desarrollo
  private readonly DEBUG_MODE = false;
  
  /**
   * Reiniciar estado del detector
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.peakSequence = [];
    this.rhythmPatterns = [];
    this.expectedNextBeatTime = 0;
    this.consecutiveNormalBeats = 0;
    this.patternConfidence = 0;
    this.recentRRHistory = [];
    this.normalRRHistory = [];
    this.rhythmVariability = 0;
    
    if (this.DEBUG_MODE) {
      console.log("ArrhythmiaDetector: Estado reiniciado, iniciando nuevo período de aprendizaje");
    }
  }

  /**
   * Verificar si está en fase de aprendizaje
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.LEARNING_PERIOD;
  }

  /**
   * Actualizar estado de fase de aprendizaje
   */
  updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      if (timeSinceStart > this.LEARNING_PERIOD) {
        // Transición de fase de aprendizaje a fase de detección
        this.isLearningPhase = false;
        
        // Calcular valores base después de fase de aprendizaje con métodos mejorados
        if (this.amplitudes.length >= this.MIN_BEATS_FOR_RHYTHM) {
          // Cálculo mejorado de línea base de amplitud - usar tercio superior para mejor referencia
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          const normalCount = Math.max(4, Math.ceil(sortedAmplitudes.length * 0.45)); // Aumentado de 0.40 a 0.45
          const topAmplitudes = sortedAmplitudes.slice(0, normalCount);
          this.avgNormalAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Amplitud normal de referencia establecida:', this.avgNormalAmplitude);
            console.log('ArrhythmiaDetector - Basado en', normalCount, 'de', this.amplitudes.length, 'muestras');
          }
        }
        
        // Cálculo mejorado de línea base de intervalo RR - manejo más robusto de valores atípicos
        if (this.rrIntervals.length >= this.MIN_BEATS_FOR_RHYTHM) {
          // Filtrar primero intervalos fisiológicamente imposibles
          const validIntervals = this.rrIntervals.filter(rr => rr >= this.MIN_VALID_RR_INTERVAL && rr <= 1500);
          
          if (validIntervals.length >= this.MIN_BEATS_FOR_RHYTHM) {
            // Ordenar intervalos RR y eliminar valores atípicos más agresivamente
            const sortedRR = [...validIntervals].sort((a, b) => a - b);
            const cutSize = Math.max(1, Math.floor(sortedRR.length * 0.18)); // Aumentado de 0.15 a 0.18
            const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
            
            // Usar mediana como referencia para robustez
            const medianIndex = Math.floor(filteredRR.length / 2);
            this.baseRRInterval = filteredRR[medianIndex];
            
            // Calcular variabilidad rítmica natural del usuario
            const sum = filteredRR.reduce((acc, val) => acc + Math.abs(val - this.baseRRInterval), 0);
            this.rhythmVariability = sum / filteredRR.length / this.baseRRInterval;
            
            // Almacenar estos intervalos como "normales confirmados"
            this.normalRRHistory = [...filteredRR];
            
            // Aprender patrones rítmicos
            this.learnRhythmPatterns();
            
            if (this.DEBUG_MODE) {
              console.log('ArrhythmiaDetector - Intervalo RR base establecido:', this.baseRRInterval);
              console.log('ArrhythmiaDetector - Variabilidad natural del ritmo:', (this.rhythmVariability * 100).toFixed(1) + '%');
              console.log('ArrhythmiaDetector - Patrones rítmicos aprendidos:', this.rhythmPatterns.length);
            }
          }
        }
        
        // Calcular confianza inicial del patrón
        this.updatePatternConfidence();
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Fase de aprendizaje completada después de', (timeSinceStart/1000).toFixed(1), 'segundos');
          console.log('ArrhythmiaDetector - Confianza inicial del patrón:', (this.patternConfidence * 100).toFixed(1) + '%');
        }
      }
    }
  }

  /**
   * Actualizar confianza en el patrón aprendido
   */
  private updatePatternConfidence(): void {
    // Basado en cantidad de datos y consistencia
    if (this.normalRRHistory.length < this.MIN_BEATS_FOR_RHYTHM) {
      this.patternConfidence = 0;
      return;
    }
    
    // Más latidos normales y consistentes = mayor confianza
    const beatCountFactor = Math.min(1, this.normalRRHistory.length / 10);
    const variabilityFactor = Math.max(0, 1 - (this.rhythmVariability * 5));
    const patternCountFactor = Math.min(1, this.rhythmPatterns.length / 3);
    
    this.patternConfidence = (beatCountFactor * 0.4) + (variabilityFactor * 0.4) + (patternCountFactor * 0.2);
  }

  /**
   * Aprender patrones rítmicos del corazón basados en intervalos RR
   * Ahora detecta múltiples patrones posibles para mayor robustez
   */
  private learnRhythmPatterns(): void {
    if (this.rrIntervals.length < this.MIN_BEATS_FOR_RHYTHM) return;
    
    // Borrar patrones anteriores
    this.rhythmPatterns = [];
    
    // Buscar patrones comunes (tripletes, cuartetos, etc.)
    for (let patternSize = 3; patternSize <= 5; patternSize++) {
      if (this.rrIntervals.length >= patternSize * 2) {
        // Buscar repeticiones de patrones de tamaño patternSize
        for (let i = 0; i <= this.rrIntervals.length - patternSize * 2; i++) {
          const pattern1 = this.rrIntervals.slice(i, i + patternSize);
          const pattern2 = this.rrIntervals.slice(i + patternSize, i + patternSize * 2);
          
          // Verificar si los patrones son similares (dentro de la variabilidad natural)
          let isSimilar = true;
          for (let j = 0; j < patternSize; j++) {
            const ratio = pattern1[j] / pattern2[j];
            if (Math.abs(ratio - 1) > this.MAX_NORMAL_RR_VARIATION) {
              isSimilar = false;
              break;
            }
          }
          
          // Si son similares, añadir a patrones conocidos
          if (isSimilar) {
            // Usar el promedio de ambas ocurrencias para mayor precisión
            const combinedPattern = pattern1.map((val, idx) => (val + pattern2[idx]) / 2);
            this.rhythmPatterns.push(combinedPattern);
          }
        }
      }
    }
    
    // Si no encontramos patrones complejos, usar los últimos intervalos normales
    if (this.rhythmPatterns.length === 0 && this.normalRRHistory.length >= 3) {
      this.rhythmPatterns.push(this.normalRRHistory.slice(-3));
    }
    
    // Calcular siguiente tiempo de latido esperado basado en el último patrón
    if (this.lastPeakTime && this.rhythmPatterns.length > 0) {
      const lastPattern = this.rhythmPatterns[this.rhythmPatterns.length - 1];
      this.expectedNextBeatTime = this.lastPeakTime + lastPattern[0];
    }
  }

  /**
   * Evaluar si un intervalo RR es consistente con nuestro patrón conocido
   */
  private isConsistentWithPattern(rrInterval: number): boolean {
    if (this.baseRRInterval === 0 || this.normalRRHistory.length < 3) {
      return true; // Sin suficientes datos para evaluar
    }
    
    // Verificar si el intervalo está dentro del rango normal para este usuario
    const ratio = rrInterval / this.baseRRInterval;
    const allowedDeviation = this.MAX_NORMAL_RR_VARIATION * (1 + (1 - this.patternConfidence));
    
    return Math.abs(ratio - 1) <= allowedDeviation;
  }

  /**
   * Actualizar intervalos RR y amplitudes de picos con nuevos datos
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Validar datos de entrada
    if (!intervals || intervals.length === 0) {
      return;
    }

    const currentTime = Date.now();
    
    // Filtrado mejorado: Almacenar intervalos válidos dentro del rango fisiológico
    this.rrIntervals = intervals.filter(interval => interval >= this.MIN_VALID_RR_INTERVAL && interval <= 1500);
    this.lastPeakTime = lastPeakTime;
    
    // Añadir al historial reciente
    if (intervals.length > 0) {
      const latestInterval = intervals[intervals.length - 1];
      this.recentRRHistory.push(latestInterval);
      
      // Limitar tamaño del historial
      if (this.recentRRHistory.length > 10) {
        this.recentRRHistory.shift();
      }
    }
    
    // Actualizar tiempo esperado del próximo latido basado en patrón rítmico
    if (lastPeakTime && this.rhythmPatterns.length > 0 && !this.isLearningPhase) {
      // Buscar el mejor patrón para predecir el siguiente latido
      let bestPattern = this.rhythmPatterns[0];
      let bestMatchScore = Number.MAX_VALUE;
      
      for (const pattern of this.rhythmPatterns) {
        const patternLength = pattern.length;
        if (this.recentRRHistory.length >= patternLength) {
          const recentPattern = this.recentRRHistory.slice(-patternLength);
          
          // Calcular puntuación de coincidencia (menor = mejor)
          let matchScore = 0;
          for (let i = 0; i < patternLength; i++) {
            matchScore += Math.abs(recentPattern[i] - pattern[i]) / pattern[i];
          }
          matchScore /= patternLength;
          
          if (matchScore < bestMatchScore) {
            bestMatchScore = matchScore;
            bestPattern = pattern;
          }
        }
      }
      
      // Usar el mejor patrón para predecir el próximo latido
      const nextPredictedInterval = bestPattern[0]; // Tomar primer elemento del patrón
      this.expectedNextBeatTime = lastPeakTime + nextPredictedInterval;
    }
    
    // Almacenar tiempo de pico
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      // Mantener solo los tiempos más recientes
      if (this.peakTimes.length > 12) { // Aumentado de 10 a 12
        this.peakTimes.shift();
      }
    }
    
    // Almacenar y procesar amplitud de pico si se proporciona
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      const ampValue = Math.abs(peakAmplitude);
      this.amplitudes.push(ampValue);
      
      // Actualizar secuencia de picos con clasificación mejorada
      if (lastPeakTime) {
        // Clasificación inicial como desconocido
        let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
        let interval = 0;
        
        // Calcular intervalo desde el pico anterior
        if (this.peakTimes.length >= 2) {
          interval = this.peakTimes[this.peakTimes.length - 1] - 
                    this.peakTimes[this.peakTimes.length - 2];
        }
        
        // Clasificación mejorada basada en amplitud si la referencia está disponible
        if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
          const ratio = ampValue / this.avgNormalAmplitude;
          
          // Criterios de clasificación más estrictos
          // Clasificar como normal si está cerca o por encima del promedio normal
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD && this.isConsistentWithPattern(interval)) {
            peakType = 'normal';
            this.consecutiveNormalBeats++;
            
            // Añadir a historial de RR normales si tiene un intervalo válido
            if (interval >= this.MIN_VALID_RR_INTERVAL && interval <= 1500) {
              this.normalRRHistory.push(interval);
              if (this.normalRRHistory.length > 15) { // Limitar historial a 15 entradas
                this.normalRRHistory.shift();
              }
            }
          } 
          // Clasificar como prematuro solo si es significativamente más pequeño Y tenemos latidos normales establecidos
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD && 
                  this.consecutiveNormalBeats >= this.MIN_NORMAL_BEATS_SEQUENCE && 
                  !this.isConsistentWithPattern(interval)) {
            peakType = 'premature';
            this.consecutiveNormalBeats = 0;
          } else {
            // Más cuidado con casos límite - marcar como desconocido
            peakType = 'unknown';
            // No reiniciar el contador de latidos normales para casos desconocidos
            // para evitar perder el seguimiento de secuencias normales con un latido
            // ligeramente atípico pero no prematuro
            if (ratio < this.NORMAL_PEAK_MIN_THRESHOLD * 0.85) {
              this.consecutiveNormalBeats = 0;
            }
          }
        }
        
        this.peakSequence.push({
          amplitude: ampValue,
          time: currentTime,
          interval: interval,
          type: peakType
        });
        
        // Mantener solo los picos más recientes
        if (this.peakSequence.length > 12) { // Aumentado de 10 a 12
          this.peakSequence.shift();
        }
      }
      
      // Mantener amplitudes e intervalos sincronizados
      if (this.amplitudes.length > this.rrIntervals.length) {
        this.amplitudes = this.amplitudes.slice(-this.rrIntervals.length);
      }
    }
    
    this.updateLearningPhase();
    
    // Actualizar confianza del patrón periódicamente
    if (!this.isLearningPhase && this.peakSequence.length % 3 === 0) {
      this.updatePatternConfidence();
      
      // Actualizar patrones rítmicos cada cierto número de nuevos latidos
      if (this.peakSequence.length % 9 === 0) {
        this.learnRhythmPatterns();
      }
    }
  }

  /**
   * Algoritmo principal de detección: enfocado exclusivamente en identificar latidos prematuros reales
   * utilizando dos métodos complementarios:
   * 1. Detección basada en ritmo: latidos que ocurren antes de lo esperado según el ritmo
   * 2. Detección basada en morfología: picos pequeños característicos entre picos normales
   * 
   * Mejorado con validación adicional para reducir falsos positivos
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // Omitir detección durante fase de aprendizaje o con datos insuficientes
    if (this.rrIntervals.length < this.MIN_BEATS_FOR_RHYTHM || 
        this.amplitudes.length < this.MIN_BEATS_FOR_RHYTHM || 
        this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.arrhythmiaCount > 0 ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Requerir suficientes latidos normales consecutivos antes de detectar latidos prematuros
    if (this.consecutiveNormalBeats < this.MIN_NORMAL_BEATS_SEQUENCE) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.arrhythmiaCount > 0 ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calcular RMSSD (raíz cuadrada media de diferencias sucesivas)
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    
    // Buscar latidos prematuros usando tiempos y patrones rítmicos
    let prematureBeatDetected = false;
    let detectionConfidence = 0;
    let detectionMethod = "";
    
    // MÉTODO 1: DETECCIÓN BASADA EN RITMO
    // Verificar si el último latido ocurrió significativamente antes de lo esperado
    if (this.lastPeakTime && this.expectedNextBeatTime > 0 && 
        this.peakSequence.length >= this.MIN_BEATS_FOR_RHYTHM && 
        this.consecutiveNormalBeats >= this.MIN_NORMAL_BEATS_SEQUENCE && 
        this.patternConfidence >= 0.65) { // Solo usar este método con buena confianza en el patrón
      
      // Calcular qué tan anticipado ocurrió el latido comparado con el tiempo esperado
      const timeDifference = this.lastPeakTime - this.expectedNextBeatTime;
      const relativeDeviation = Math.abs(timeDifference) / this.baseRRInterval;
      
      // Latidos prematuros ocurren significativamente antes de lo esperado
      if (timeDifference < 0 && relativeDeviation > this.RHYTHM_DEVIATION_THRESHOLD) {
        // También verificar si la amplitud es menor (característica de latidos prematuros)
        const lastPeak = this.peakSequence[this.peakSequence.length - 1];
        
        // Verificar también los picos anteriores para comparación
        const previousIndices = [];
        for (let i = this.peakSequence.length - 2; i >= 0 && previousIndices.length < 3; i--) {
          if (this.peakSequence[i].type === 'normal') {
            previousIndices.push(i);
          }
        }
        
        // Solo proceder si tenemos al menos 2 picos normales anteriores para comparar
        if (previousIndices.length >= 2) {
          const previousPeaks = previousIndices.map(idx => this.peakSequence[idx]);
          
          // Calcular amplitud promedio de picos normales anteriores
          const avgNormalAmp = previousPeaks.reduce((sum, peak) => sum + peak.amplitude, 0) / previousPeaks.length;
          
          // Criterios mejorados: requerir una amplitud significativamente menor Y verificar que sea menor que ambos vecinos
          const isAmplitudeSmaller = lastPeak.amplitude < avgNormalAmp * this.AMPLITUDE_RATIO_THRESHOLD;
          
          // También verificar que el intervalo RR es consistentemente anormal
          const isIntervalAbnormal = !this.isConsistentWithPattern(lastPeak.interval);
          
          if (isAmplitudeSmaller && isIntervalAbnormal) {
            prematureBeatDetected = true;
            
            // Calcular confianza basada en múltiples factores
            const amplitudeRatio = lastPeak.amplitude / avgNormalAmp;
            const deviationConfidence = Math.min(1, relativeDeviation / 0.6);
            const amplitudeConfidence = Math.min(1, (this.AMPLITUDE_RATIO_THRESHOLD - amplitudeRatio) / this.AMPLITUDE_RATIO_THRESHOLD);
            
            detectionConfidence = 0.90 + 
                                (deviationConfidence * 0.05) + 
                                (amplitudeConfidence * 0.05) * 
                                (this.patternConfidence);
            
            detectionMethod = "rhythm";
            
            if (this.DEBUG_MODE) {
              console.log('ArrhythmiaDetector - Latido prematuro detectado por patrón rítmico', {
                esperado: this.expectedNextBeatTime,
                actual: this.lastPeakTime,
                desviacion: relativeDeviation,
                relacionAmplitud: amplitudeRatio,
                confianza: detectionConfidence
              });
            }
          }
        }
      }
    }
    
    // MÉTODO 2: DETECCIÓN BASADA EN MORFOLOGÍA
    // Buscar el patrón clásico: secuencia normal-prematuro-normal
    if (!prematureBeatDetected && this.peakSequence.length >= 3) {
      const lastThreePeaks = this.peakSequence.slice(-3);
      
      // Clasificación de picos mejorada con criterios más estrictos
      for (let i = 0; i < lastThreePeaks.length; i++) {
        const peak = lastThreePeaks[i];
        const ratio = peak.amplitude / this.avgNormalAmplitude;
        
        // Clasificación más decisiva con zona "desconocida" más estrecha
        if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD && this.isConsistentWithPattern(peak.interval)) {
          lastThreePeaks[i].type = 'normal';
        } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD && !this.isConsistentWithPattern(peak.interval)) {
          lastThreePeaks[i].type = 'premature';
        } else {
          lastThreePeaks[i].type = 'unknown';
        }
      }
      
      // Verificar patrón normal-prematuro-normal con verificación estricta
      if (
        lastThreePeaks[0].type === 'normal' && 
        lastThreePeaks[1].type === 'premature' && 
        lastThreePeaks[2].type === 'normal'
      ) {
        // Verificación de amplitud mejorada
        const firstPeakRatio = lastThreePeaks[0].amplitude / this.avgNormalAmplitude;
        const secondPeakRatio = lastThreePeaks[1].amplitude / this.avgNormalAmplitude;
        const thirdPeakRatio = lastThreePeaks[2].amplitude / this.avgNormalAmplitude;
        
        // Criterios más estrictos: el latido prematuro debe ser significativamente más pequeño que ambos latidos normales circundantes
        // y los latidos normales deben estar claramente por encima del umbral normal
        if (
            secondPeakRatio <= this.AMPLITUDE_RATIO_THRESHOLD && 
            secondPeakRatio < firstPeakRatio * 0.65 && // Más estricto (de 0.70 a 0.65)
            secondPeakRatio < thirdPeakRatio * 0.65 && // Más estricto (de 0.70 a 0.65)
            firstPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD * 1.08 && // Debe ser claramente normal (aumentado)
            thirdPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD * 1.08     // Debe ser claramente normal (aumentado)
        ) {
          
          // Verificación adicional de tiempo: verificar que los intervalos de tiempo coinciden con el patrón prematuro
          // Obtener diferencias de tiempo
          const firstToSecond = lastThreePeaks[1].time - lastThreePeaks[0].time;
          const secondToThird = lastThreePeaks[2].time - lastThreePeaks[1].time;
          
          // En un patrón prematuro clásico, firstToSecond es más corto de lo normal y secondToThird es más largo
          if (
              this.baseRRInterval > 0 && 
              firstToSecond < this.baseRRInterval * this.PREMATURE_BEAT_THRESHOLD && 
              secondToThird > this.baseRRInterval * 1.08 // Incrementado de 1.05 a 1.08
          ) {
            prematureBeatDetected = true;
            detectionConfidence = 0.96; // Alta confianza para este patrón clásico verificado
            detectionMethod = "morphology";
            
            if (this.DEBUG_MODE) {
              console.log('ArrhythmiaDetector - Latido prematuro detectado por patrón morfológico', {
                relacionPrematura: secondPeakRatio,
                relacionesNormales: [firstPeakRatio, thirdPeakRatio],
                intervalosTemporales: [firstToSecond, secondToThird],
                intervaloBase: this.baseRRInterval,
                confianza: detectionConfidence
              });
            }
          }
        }
      }
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    
    // Contar arritmia solo si:
    // 1. Se detectó un latido prematuro
    // 2. La confianza supera el umbral mínimo más alto
    // 3. Ha pasado suficiente tiempo desde la última detección para evitar duplicados
    if (prematureBeatDetected && 
        detectionConfidence >= this.MIN_CONFIDENCE_THRESHOLD && 
        currentTime - this.lastArrhythmiaTime > this.DETECTION_COOLDOWN) {
      
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.consecutiveNormalBeats = 0; // Reiniciar contador de latidos normales
      
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - NUEVA ARRITMIA CONTADA:', {
          conteo: this.arrhythmiaCount,
          confianza: detectionConfidence,
          metodo: detectionMethod,
          marca_tiempo: new Date(currentTime).toISOString(),
          secuencia_picos: this.peakSequence.slice(-5).map(p => ({
            tipo: p.type,
            relacion: p.amplitude / this.avgNormalAmplitude
          }))
        });
      }
      
      // CRUCIAL: Después de detectar una arritmia, volver inmediatamente a estado normal
      // de vigilancia, sin considerar los siguientes latidos automáticamente como anormales
      this.arrhythmiaDetected = false;
    } else {
      this.arrhythmiaDetected = false;
    }

    return {
      detected: prematureBeatDetected && detectionConfidence >= this.MIN_CONFIDENCE_THRESHOLD,
      count: this.arrhythmiaCount,
      status: this.arrhythmiaCount > 0 ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd, 
        rrVariation, 
        prematureBeat: prematureBeatDetected && detectionConfidence >= this.MIN_CONFIDENCE_THRESHOLD,
        confidence: detectionConfidence
      }
    };
  }

  /**
   * Obtener estado actual de arritmia
   */
  getStatus(): string {
    return this.arrhythmiaCount > 0 ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Obtener conteo actual de arritmias
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Función de limpieza de memoria para gestión de recursos
   */
  cleanMemory(): void {
    this.reset();
  }
}
