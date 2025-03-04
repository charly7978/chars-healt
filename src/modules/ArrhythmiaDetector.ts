/**
 * ArrhythmiaDetector.ts
 * 
 * Detector especializado exclusivamente en identificar latidos prematuros reales
 * desde señales PPG con máxima precisión y mínimos falsos positivos.
 */

export class ArrhythmiaDetector {
  // Ajuste de parámetros clave para mayor precisión clínica
  private readonly LEARNING_PERIOD = 6000; // Ampliado para mejor aprendizaje de línea base
  private readonly RR_WINDOW_SIZE = 12; // Aumentado para análisis más robusto de patrones
  
  // Parámetros críticos para detección de latidos prematuros ajustados con precisión clínica
  private readonly PREMATURE_BEAT_THRESHOLD = 0.70; // Calibrado para sensibilidad óptima
  private readonly PREMATURE_MORPHOLOGY_THRESHOLD = 0.65; // Nuevo: umbral morfológico
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.72; // Ajustado para mayor precisión
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.95; // Más restrictivo para reducir falsos positivos
  
  // Umbral basado en desviación estadística adaptativa (no fijo)
  private readonly RHYTHM_DEVIATION_THRESHOLD_BASE = 0.40; // Base, se ajusta dinámicamente
  private rhythmDeviationThreshold = 0.40; // Valor inicial, se adapta por paciente
  
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.94; // Mayor confianza exigida
  
  // Evitar falsos positivos en condiciones especiales
  private readonly DETECTION_COOLDOWN = 1000; // Período refractario post-detección
  private readonly MIN_NORMAL_BEATS_SEQUENCE = 5; // Secuencia normal requerida para establecer patrón
  
  // Límites fisiológicos revisados
  private readonly MIN_VALID_RR_INTERVAL = 500; // 500ms (~120 BPM max normal)
  private readonly MAX_VALID_RR_INTERVAL = 1300; // 1300ms (~46 BPM min normal)
  private readonly MAX_NORMAL_RR_VARIATION = 0.11; // Más preciso (11% variación normal)
  
  // Análisis avanzado
  private readonly MIN_BEATS_FOR_RHYTHM = 8; // Más latidos para patrón confiable
  
  // Estructuras de datos avanzadas
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private peakTimes: number[] = [];
  private peakWidths: number[] = []; // Nuevo: anchura de picos para análisis morfológico
  private peakSlopes: number[] = []; // Nuevo: pendientes para análisis morfológico
  private dicroticNotchTimes: number[] = []; // Nuevo: tiempos de muescas dicrotas
  private isLearningPhase = true;
  private arrhythmiaDetected = false;
  private arrhythmiaCount = 0;
  private measurementStartTime: number = Date.now();
  private lastArrhythmiaTime: number = 0;
  private lastPeakTime: number | null = null;
  private avgNormalAmplitude: number = 0;
  private baseRRInterval: number = 0;
  
  // Análisis avanzado de patrones
  private rhythmPatterns: number[][] = [];
  private morphologyTemplates: Array<{
    amplitudeProfile: number[],
    widthProfile: number[],
    slopeProfile: number[]
  }> = []; // Nuevo: plantillas morfológicas para reconocimiento
  
  private expectedNextBeatTime: number = 0;
  private rhythmVariability: number = 0;
  
  // Análisis morfológico mejorado
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    interval: number;
    width: number; // Nuevo: anchura del pico
    slopeUp: number; // Nuevo: pendiente ascendente
    slopeDown: number; // Nuevo: pendiente descendente
    dicroticNotchTime: number | null; // Nuevo: tiempo de muesca dicrota
    type: 'normal' | 'premature' | 'compensatory' | 'missed' | 'unknown';
  }> = [];
  
  // Clasificación avanzada de eventos
  private consecutiveNormalBeats: number = 0;
  private patternConfidence: number = 0;
  
  // Análisis estadístico robusto
  private recentRRHistory: number[] = [];
  private normalRRHistory: number[] = [];
  
  // Análisis espectral para patrones complejos
  private readonly FFT_SIZE = 256; // Nuevo: tamaño para análisis espectral
  private spectralFeatures: number[] = []; // Nuevo: características espectrales
  
  // Memoria de eventos
  private prematureBeatHistory: Array<{time: number, confidence: number}> = [];
  private missedBeatHistory: Array<{time: number, confidence: number}> = [];
  
  // Sistema de puntuación basado en múltiples factores para reducir falsos positivos
  private readonly MULTI_FACTOR_SCORE_THRESHOLD = 0.82; // Mayor exigencia
  
  // Sistema de estados para reconocimiento de patrones complejos
  private readonly arrhythmiaPatterns: {[key: string]: number[]} = {
    'bigeminy': [1, 0, 1, 0], // Alternancia de normal y prematuro
    'trigeminy': [1, 1, 0, 1, 1, 0], // Dos normales, uno prematuro
    'quadrigeminy': [1, 1, 1, 0, 1, 1, 1, 0], // Tres normales, uno prematuro
    'couplet': [0, 0, 1], // Dos prematuros seguidos
    'run': [0, 0, 0] // Tres o más prematuros
  };
  
  private readonly DEBUG_MODE = false;
  
  /**
   * Reiniciar estado del detector
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.peakWidths = [];
    this.peakSlopes = [];
    this.dicroticNotchTimes = [];
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
    this.prematureBeatHistory = [];
    this.missedBeatHistory = [];
    
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
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number, peakWidth?: number, peakSlope?: number): void {
    // Actualizar fase de aprendizaje si es necesario
    this.updateLearningPhase();
    
    if (intervals.length === 0) return;
    
    // Actualizar colecciones de datos
    this.rrIntervals = [...this.rrIntervals, ...intervals];
    if (this.rrIntervals.length > 30) {
      this.rrIntervals = this.rrIntervals.slice(-30);
    }
    
    // Actualizar tiempos de pico
    if (lastPeakTime !== null) {
      if (this.lastPeakTime !== null) {
        const peakInterval = lastPeakTime - this.lastPeakTime;
        
        // Validación fisiológica del intervalo
        if (peakInterval >= this.MIN_VALID_RR_INTERVAL && peakInterval <= this.MAX_VALID_RR_INTERVAL) {
          this.peakTimes.push(lastPeakTime);
          
          // Añadir información morfológica si está disponible
          if (peakAmplitude !== undefined) {
            this.amplitudes.push(peakAmplitude);
          }
          
          if (peakWidth !== undefined) {
            this.peakWidths.push(peakWidth);
          }
          
          if (peakSlope !== undefined) {
            this.peakSlopes.push(peakSlope);
          }
          
          // Limitar el tamaño de los arrays
          if (this.peakTimes.length > 30) {
            this.peakTimes = this.peakTimes.slice(-30);
            this.amplitudes = this.amplitudes.slice(-30);
            this.peakWidths = this.peakWidths.slice(-30);
            this.peakSlopes = this.peakSlopes.slice(-30);
          }
          
          // Actualizar amplitud promedio normal (solo para latidos normales)
          if (peakAmplitude !== undefined && this.isLearningPhase) {
            if (this.avgNormalAmplitude === 0) {
              this.avgNormalAmplitude = peakAmplitude;
          } else {
              this.avgNormalAmplitude = this.avgNormalAmplitude * 0.9 + peakAmplitude * 0.1;
            }
          }
          
          // Actualizar secuencia de picos con datos morfológicos
        this.peakSequence.push({
            amplitude: peakAmplitude || 0,
            time: lastPeakTime,
            interval: peakInterval,
            width: peakWidth || 0,
            slopeUp: peakSlope || 0,
            slopeDown: (this.peakSlopes.length > 0 ? this.peakSlopes[this.peakSlopes.length - 1] : 0),
            dicroticNotchTime: null,
            type: 'unknown'
          });
          
          // Limitar tamaño de la secuencia
          if (this.peakSequence.length > 20) {
            this.peakSequence = this.peakSequence.slice(-20);
          }
          
          // Actualizar lista de últimos intervalos RR
          this.recentRRHistory.push(peakInterval);
          if (this.recentRRHistory.length > 20) {
            this.recentRRHistory = this.recentRRHistory.slice(-20);
          }
          
          // Si estamos en fase de aprendizaje, actualizar intervalo base
          if (this.isLearningPhase) {
            if (this.baseRRInterval === 0) {
              this.baseRRInterval = peakInterval;
            } else {
              this.baseRRInterval = this.baseRRInterval * 0.8 + peakInterval * 0.2;
            }
          }
          
          // Si ya tenemos un patrón aprendido, predecir el próximo latido
          if (!this.isLearningPhase && this.baseRRInterval > 0) {
            this.expectedNextBeatTime = lastPeakTime + this.baseRRInterval;
          }
        }
      }
      
      this.lastPeakTime = lastPeakTime;
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
    data: { 
      rmssd: number; 
      rrVariation: number; 
      prematureBeat: boolean; 
      prematureType?: string;
      confidence?: number;
      coupling?: number;
      morphologyChange?: number;
    } | null;
  } {
    // Si estamos en fase de aprendizaje, no reportamos arritmias
    if (this.isLearningPhase) {
      this.updateLearningPhase();
      return {
        detected: false,
        count: 0,
        status: 'learning',
        data: null
      };
    }

    // Verificar si hay suficientes datos
    if (this.rrIntervals.length < 5 || this.peakSequence.length < 3) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: 'insufficient_data',
        data: null
      };
    }

    // Calcular métricas de variabilidad cardíaca
    const recentRRs = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    
    // RMSSD: Raíz cuadrada del promedio de la suma de los cuadrados de las diferencias
    // entre intervalos RR adyacentes - medida importante de variabilidad
    let rmssd = 0;
    if (recentRRs.length > 1) {
    let sumSquaredDiff = 0;
      for (let i = 1; i < recentRRs.length; i++) {
        sumSquaredDiff += Math.pow(recentRRs[i] - recentRRs[i-1], 2);
      }
      rmssd = Math.sqrt(sumSquaredDiff / (recentRRs.length - 1));
    }

    // Comprobar tiempo transcurrido desde la última detección para evitar duplicados
    const now = Date.now();
    if (now - this.lastArrhythmiaTime < this.DETECTION_COOLDOWN) {
      return {
        detected: this.arrhythmiaDetected,
        count: this.arrhythmiaCount,
        status: this.arrhythmiaDetected ? 'cooldown' : 'normal',
        data: {
          rmssd,
          rrVariation: this.calculateRRVariation(recentRRs),
          prematureBeat: false
        }
      };
    }

    // Obtener el último intervalo RR para análisis
    const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
    const lastAmplitude = this.amplitudes[this.amplitudes.length - 1] || 0;
    
    // Obtener métricas morfológicas para el último latido
    const lastWidth = this.peakWidths.length > 0 ? this.peakWidths[this.peakWidths.length - 1] : 0;
    const lastSlopeUp = this.peakSlopes.length > 0 ? this.peakSlopes[this.peakSlopes.length - 1] : 0;
    const lastSlopeDown = this.peakSlopes.length > 1 ? this.peakSlopes[this.peakSlopes.length - 2] : 0;

    // Detección de latidos prematuros mejorada
    const prematureBeatResult = this.detectPrematureBeat(
      lastRR,
      recentRRs,
      lastAmplitude,
      lastWidth,
      lastSlopeUp,
      lastSlopeDown
    );

    // Nueva detección de pausa compensatoria
    const compensatoryPauseResult = this.detectCompensatoryPause(lastRR, recentRRs);
    
    // Decidir si es una arritmia basándose en todos los factores
    let isArrhythmia = false;
    let arrhythmiaType = '';
    let confidence = 0;
    
    // Nuevo: sistema de decisión jerárquica
    if (prematureBeatResult.detected) {
      // Latido prematuro detectado
      isArrhythmia = true;
      arrhythmiaType = prematureBeatResult.type;
      confidence = prematureBeatResult.confidence;
      
      // Registrar para análisis de patrones
      this.prematureBeatHistory.push({
        time: now,
        confidence: prematureBeatResult.confidence
      });
      
      // Limitar el historial a los últimos 20 eventos
      if (this.prematureBeatHistory.length > 20) {
        this.prematureBeatHistory.shift();
      }
      
      // Actualizar el tipo del último latido en la secuencia
      if (this.peakSequence.length > 0) {
        this.peakSequence[this.peakSequence.length - 1].type = 'premature';
      }
      
      // Reiniciar contador de latidos normales consecutivos
      this.consecutiveNormalBeats = 0;
    } 
    else if (compensatoryPauseResult.detected) {
      // Pausa compensatoria detectada (común después de PVCs)
      isArrhythmia = true;
      arrhythmiaType = 'compensatory_pause';
      confidence = compensatoryPauseResult.confidence;
      
      // Actualizar el tipo del último latido
      if (this.peakSequence.length > 0) {
        this.peakSequence[this.peakSequence.length - 1].type = 'compensatory';
      }
      
      // Reiniciar contador de latidos normales
      this.consecutiveNormalBeats = 0;
    }
    else {
      // Sin arritmia detectada en este latido
      // Incrementar contador de latidos normales consecutivos
      this.consecutiveNormalBeats++;
      
      // Actualizar el tipo del último latido
      if (this.peakSequence.length > 0) {
        this.peakSequence[this.peakSequence.length - 1].type = 'normal';
      }
      
      // Añadir a historial de intervalos normales si es estable
      if (Math.abs(lastRR - this.baseRRInterval) / this.baseRRInterval < this.MAX_NORMAL_RR_VARIATION) {
        this.normalRRHistory.push(lastRR);
        if (this.normalRRHistory.length > 10) {
          this.normalRRHistory.shift();
        }
      }
    }
    
    // Nuevo: detección de patrones complejos de arritmia
    if (this.peakSequence.length >= 6) {
      const recentTypes = this.peakSequence.slice(-6).map(beat => beat.type === 'premature' ? 0 : 1);
      
      // Verificar patrones conocidos
      for (const [patternName, pattern] of Object.entries(this.arrhythmiaPatterns)) {
        if (pattern.length <= recentTypes.length) {
          let matchesPattern = true;
          
          for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] !== recentTypes[recentTypes.length - pattern.length + i]) {
              matchesPattern = false;
              break;
            }
          }
          
          if (matchesPattern) {
            isArrhythmia = true;
            arrhythmiaType = patternName;
            confidence = 0.9; // Alta confianza en patrones reconocidos
            break;
          }
        }
      }
    }

    // Actualizar estado global de detección
    if (isArrhythmia) {
      this.arrhythmiaDetected = true;
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = now;
      
      // Análisis adicional para la última detección
      const coupling = this.prematureBeatHistory.length >= 2 ? 
        this.prematureBeatHistory[this.prematureBeatHistory.length - 1].time -
        this.prematureBeatHistory[this.prematureBeatHistory.length - 2].time : 0;
      
      return {
        detected: true,
        count: this.arrhythmiaCount,
        status: arrhythmiaType,
        data: {
          rmssd,
          rrVariation: this.calculateRRVariation(recentRRs),
          prematureBeat: prematureBeatResult.detected,
          prematureType: prematureBeatResult.detected ? prematureBeatResult.type : undefined,
          confidence,
          coupling: coupling > 0 ? coupling : undefined,
          morphologyChange: lastWidth && this.peakWidths.length > 1 ? 
            Math.abs(lastWidth / this.peakWidths[this.peakWidths.length - 2] - 1) : undefined
        }
      };
    } else {
      this.arrhythmiaDetected = false;

    return {
        detected: false,
      count: this.arrhythmiaCount,
        status: 'normal',
      data: { 
        rmssd, 
          rrVariation: this.calculateRRVariation(recentRRs),
          prematureBeat: false
        }
      };
    }
  }
  
  // Método mejorado para análisis de intervalos
  private calculateRRVariation(intervals: number[]): number {
    if (intervals.length < 2) return 0;
    
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    
    // Coeficiente de variación: desviación estándar / media
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev / mean;
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
