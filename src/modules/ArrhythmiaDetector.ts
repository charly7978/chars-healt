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
  
  // Constantes de análisis RR (basadas en guías médicas)
  private readonly MIN_RR_MS = 300;  // 200 BPM máximo
  private readonly MAX_RR_MS = 1500; // 40 BPM mínimo
  private readonly MISSED_BEAT_THRESHOLD = 1.65;    // 65% más largo que el promedio
  
  // Buffers de análisis
  private rrTimestamps: number[] = [];
  private peakAmplitudes: number[] = [];
  private readonly BUFFER_SIZE = 32; // ~30 segundos de datos a 60 BPM
  
  // Estado del análisis
  private baselineRR: number = 0;
  private baselineAmplitude: number = 0;
  private lastArrhythmiaType: string = '';
  
  // Métricas de variabilidad
  private rmssd: number = 0;        // Root Mean Square of Successive Differences
  private rrVariation: number = 0;   // Variación RR en porcentaje
  private pnnx: number = 0;         // Porcentaje de intervalos RR que difieren más de X ms
  private sdnn: number = 0;         // Desviación estándar de intervalos RR
  
  // Análisis morfológico
  private morphologyBuffer: Array<{
    amplitude: number;
    width: number;
    symmetry: number;
  }> = [];

  constructor() {
    this.reset();
  }
  
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
    this.rrTimestamps = [];
    this.peakAmplitudes = [];
    this.baselineRR = 0;
    this.baselineAmplitude = 0;
    this.lastArrhythmiaType = '';
    this.rmssd = 0;
    this.rrVariation = 0;
    this.pnnx = 0;
    this.sdnn = 0;
    this.morphologyBuffer = [];
    
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
   * Analiza un nuevo pico R detectado
   * @param timestamp Tiempo exacto del pico en ms
   * @param amplitude Amplitud del pico (opcional)
   * @param confidence Confianza en la detección (0-1)
   * @returns Análisis de arritmia
   */
  analyzePeak(
    timestamp: number,
    amplitude: number,
    confidence: number
  ): {
    isArrhythmia: boolean;
    type: string;
    confidence: number;
    metrics: {
      rmssd: number;
      rrVariation: number;
      pnnx: number;
      sdnn: number;
    };
  } {
    if (confidence < this.MIN_CONFIDENCE_THRESHOLD) {
      return this.createResult(false, 'SEÑAL_DÉBIL');
    }

    // Calcular intervalo RR si tenemos un pico previo
    if (this.lastPeakTime !== null) {
      const rrInterval = timestamp - this.lastPeakTime;
      
      // Validar intervalo RR fisiológicamente posible
      if (rrInterval >= this.MIN_RR_MS && rrInterval <= this.MAX_RR_MS) {
        this.updateBuffers(rrInterval, timestamp, amplitude);
        
        // Actualizar métricas de variabilidad
        this.updateVariabilityMetrics();
        
        // Analizar morfología del pico
        this.analyzePeakMorphology(amplitude);
        
        // Detectar arritmias específicas
        return this.detectArrhythmias(rrInterval, amplitude);
      }
    }

    this.lastPeakTime = timestamp;
    return this.createResult(false, 'RITMO_NORMAL');
  }

  /**
   * Actualiza los buffers de análisis
   */
  private updateBuffers(rrInterval: number, timestamp: number, amplitude: number): void {
    // Actualizar buffers con límite de tamaño
    this.rrIntervals.push(rrInterval);
    this.rrTimestamps.push(timestamp);
    this.peakAmplitudes.push(amplitude);

    if (this.rrIntervals.length > this.BUFFER_SIZE) {
      this.rrIntervals.shift();
      this.rrTimestamps.shift();
      this.peakAmplitudes.shift();
    }

    // Actualizar líneas base
    if (this.rrIntervals.length >= 5) {
      // Usar mediana para mayor robustez
      const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
      this.baselineRR = sortedRR[Math.floor(sortedRR.length / 2)];
      
      const sortedAmplitudes = [...this.peakAmplitudes].sort((a, b) => a - b);
      this.baselineAmplitude = sortedAmplitudes[Math.floor(sortedAmplitudes.length / 2)];
    }
  }

  /**
   * Actualiza métricas de variabilidad del ritmo cardíaco
   */
  private updateVariabilityMetrics(): void {
    if (this.rrIntervals.length < 2) return;

    // Calcular RMSSD
    let sumSquaredDiff = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i - 1];
      sumSquaredDiff += diff * diff;
    }
    this.rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));

    // Calcular variación RR
    const maxRR = Math.max(...this.rrIntervals);
    const minRR = Math.min(...this.rrIntervals);
    this.rrVariation = ((maxRR - minRR) / this.baselineRR) * 100;

    // Calcular pNN50
    let nn50Count = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      if (Math.abs(this.rrIntervals[i] - this.rrIntervals[i - 1]) > 50) {
        nn50Count++;
      }
    }
    this.pnnx = (nn50Count / (this.rrIntervals.length - 1)) * 100;

    // Calcular SDNN
    const mean = this.rrIntervals.reduce((sum, val) => sum + val, 0) / this.rrIntervals.length;
    const sumSquared = this.rrIntervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    this.sdnn = Math.sqrt(sumSquared / this.rrIntervals.length);
  }

  /**
   * Analiza la morfología del pico R
   */
  private analyzePeakMorphology(amplitude: number): void {
    if (this.peakAmplitudes.length < 3) return;

    const width = this.estimatePeakWidth();
    const symmetry = this.calculatePeakSymmetry();

    this.morphologyBuffer.push({ amplitude, width, symmetry });
    if (this.morphologyBuffer.length > 10) {
      this.morphologyBuffer.shift();
    }
  }

  /**
   * Estima el ancho del pico R (simplificado para web)
   */
  private estimatePeakWidth(): number {
    // En una implementación real, esto usaría más puntos de la forma de onda
    const recentAmplitudes = this.peakAmplitudes.slice(-3);
    return Math.abs(recentAmplitudes[2] - recentAmplitudes[0]);
  }

  /**
   * Calcula la simetría del pico R
   */
  private calculatePeakSymmetry(): number {
    // En una implementación real, esto analizaría la forma completa del pico
    const recentAmplitudes = this.peakAmplitudes.slice(-3);
    const leftDiff = Math.abs(recentAmplitudes[1] - recentAmplitudes[0]);
    const rightDiff = Math.abs(recentAmplitudes[2] - recentAmplitudes[1]);
    return Math.min(leftDiff, rightDiff) / Math.max(leftDiff, rightDiff);
  }

  /**
   * Detecta arritmias específicas basadas en el análisis
   */
  private detectArrhythmias(currentRR: number, amplitude: number): {
    isArrhythmia: boolean;
    type: string;
    confidence: number;
    metrics: { rmssd: number; rrVariation: number; pnnx: number; sdnn: number };
  } {
    if (this.rrIntervals.length < 5) {
      return this.createResult(false, 'ANÁLISIS_INSUFICIENTE');
    }

    // Detección de latido prematuro
    if (currentRR < this.baselineRR * this.PREMATURE_BEAT_THRESHOLD) {
      if (amplitude < this.baselineAmplitude * 0.8) {
        this.arrhythmiaCount++;
        this.lastArrhythmiaType = 'CONTRACCIÓN_VENTRICULAR_PREMATURA';
        return this.createResult(true, 'CONTRACCIÓN_VENTRICULAR_PREMATURA');
      } else {
        this.arrhythmiaCount++;
        this.lastArrhythmiaType = 'CONTRACCIÓN_AURICULAR_PREMATURA';
        return this.createResult(true, 'CONTRACCIÓN_AURICULAR_PREMATURA');
      }
    }

    // Detección de latido perdido o bloqueo
    if (currentRR > this.baselineRR * this.MISSED_BEAT_THRESHOLD) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaType = 'PAUSA_O_BLOQUEO';
      return this.createResult(true, 'PAUSA_O_BLOQUEO');
    }

    // Detección de fibrilación auricular
    if (this.rmssd > 100 && this.rrVariation > 20) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaType = 'FIBRILACIÓN_AURICULAR';
      return this.createResult(true, 'FIBRILACIÓN_AURICULAR');
    }

    // Ritmo normal
    return this.createResult(false, 'RITMO_NORMAL');
  }

  /**
   * Crea el resultado del análisis
   */
  private createResult(
    isArrhythmia: boolean,
    type: string
  ): {
    isArrhythmia: boolean;
    type: string;
    confidence: number;
    metrics: { rmssd: number; rrVariation: number; pnnx: number; sdnn: number };
  } {
    // Calcular confianza basada en calidad de señal y estabilidad
    const confidence = this.calculateConfidence();

    return {
      isArrhythmia,
      type,
      confidence,
      metrics: {
        rmssd: Math.round(this.rmssd * 10) / 10,
        rrVariation: Math.round(this.rrVariation * 10) / 10,
        pnnx: Math.round(this.pnnx * 10) / 10,
        sdnn: Math.round(this.sdnn * 10) / 10
      }
    };
  }

  /**
   * Calcula la confianza en la detección
   */
  private calculateConfidence(): number {
    if (this.rrIntervals.length < 5) return 0;

    // Factores de confianza
    const stabilityFactor = Math.max(0, Math.min(1, 1 - (this.rrVariation / 100)));
    const morphologyFactor = this.calculateMorphologyConsistency();
    const dataQualityFactor = Math.min(1, this.rrIntervals.length / this.BUFFER_SIZE);

    return Math.round((stabilityFactor * 0.4 + morphologyFactor * 0.4 + dataQualityFactor * 0.2) * 100) / 100;
  }

  /**
   * Calcula la consistencia en la morfología de los picos
   */
  private calculateMorphologyConsistency(): number {
    if (this.morphologyBuffer.length < 3) return 0;

    const amplitudeVariation = this.calculateVariation(this.morphologyBuffer.map(m => m.amplitude));
    const widthVariation = this.calculateVariation(this.morphologyBuffer.map(m => m.width));
    const symmetryVariation = this.calculateVariation(this.morphologyBuffer.map(m => m.symmetry));

    return Math.max(0, 1 - (amplitudeVariation + widthVariation + symmetryVariation) / 3);
  }

  /**
   * Calcula la variación de un conjunto de valores
   */
  private calculateVariation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / mean;
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

  /**
   * Obtener último tipo de arritmia detectado
   */
  getLastArrhythmiaType(): string {
    return this.lastArrhythmiaType;
  }
}
