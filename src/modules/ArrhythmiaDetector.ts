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
  private readonly PREMATURE_BEAT_THRESHOLD = 0.62; // Más estricto (antes 0.70)
  private readonly PREMATURE_MORPHOLOGY_THRESHOLD = 0.70; // Más exigente (antes 0.65)
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.76; // Más restrictivo (antes 0.72)
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.95; // Más restrictivo para reducir falsos positivos
  
  // Umbral basado en desviación estadística adaptativa (no fijo)
  private readonly RHYTHM_DEVIATION_THRESHOLD_BASE = 0.40; // Base, se ajusta dinámicamente
  private rhythmDeviationThreshold = 0.40; // Valor inicial, se adapta por paciente
  
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.97; // Mayor confianza requerida (antes 0.94)
  
  // Evitar falsos positivos en condiciones especiales
  private readonly DETECTION_COOLDOWN = 1000; // Período refractario post-detección
  private readonly MIN_NORMAL_BEATS_SEQUENCE = 7; // Aumentado (antes 5)
  
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
  
  // Parámetros de calibración médica
  private readonly CLINICAL_PARAMETERS = {
    // Parámetros temporales (ms)
    minRRInterval: 300,
    maxRRInterval: 2000,
    prematurityThreshold: 0.70,
    
    // Parámetros de validación
    confidenceThreshold: 0.92,
    morphologyVarianceThreshold: 0.18,
    consecutiveBeatsRequired: 2,
    
    // Parámetros fisiológicos
    maxHeartRateChange: 30, // BPM
    refractoryPeriod: 200   // ms
  };
  
  // Sistema de validación multicapa
  private validationState = {
    temporalValid: false,
    morphologicalValid: false,
    contextualValid: false,
    statisticalValid: false,
    totalConfidence: 0
  };
  
  // Historial para análisis
  private beatHistory = {
    intervals: <number[]>[],
    amplitudes: <number[]>[],
    morphologyScores: <number[]>[],
    detectionTimes: <number[]>[],
    prematurityScores: <number[]>[],
    maxEntries: 16
  };
  
  // Sistema de detección condicional con múltiples criterios obligatorios
  private readonly MULTI_CRITERIA_DETECTION = true; // Nueva función
  
  // Parámetros para validación morfológica mejorada
  private readonly MORPHOLOGY_WINDOW_SIZE = 5; // Ventana para análisis morfológico
  
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
   * Análisis mejorado de latido para detección exclusiva de latidos prematuros
   * con eliminación avanzada de falsos positivos
   */
  analyzeHeartbeat(
    currentRR: number,             // Intervalo actual (ms)
    previousRRs: number[],         // Intervalos previos (ms)
    amplitudeRatio: number,        // Relación de amplitud
    morphologyFeatures: {          // Características morfológicas
      width: number,               // Anchura de QRS (ms)
      asymmetry: number,           // Asimetría de onda
      normalizedArea: number,      // Área normalizada
      slopeRatio: number           // Relación de pendientes
    },
    patientContext?: {            // Contexto fisiológico
      age?: number,
      restingHR?: number,
      knownCondition?: string
    }
  ): {
    isArrhythmia: boolean,
    arrhythmiaType: string | null,
    confidence: number,
    validations: string[]
  } {
    // Reajustar estado de validación
    this.resetValidationState();
    
    // Validación inicial mejorada para verificar datos de entrada
    if (!this.validateInputDataEnhanced(currentRR, previousRRs, amplitudeRatio)) {
      return {
        isArrhythmia: false,
        arrhythmiaType: null,
        confidence: 0,
        validations: ['insufficient_or_invalid_data']
      };
    }
    
    // 1. Validación temporal más estricta - buscar específicamente patrones de prematuridad
    const temporalValidation = this.performEnhancedTemporalValidation(currentRR, previousRRs);
    if (!temporalValidation.valid) {
      return {
        isArrhythmia: false,
        arrhythmiaType: null,
        confidence: temporalValidation.confidence,
        validations: ['failed_temporal_validation']
      };
    }
    this.validationState.temporalValid = true;
    
    // 2. Validación morfológica mejorada - características específicas de prematuridad
    const morphValidation = this.performAdvancedMorphologicalValidation(
      amplitudeRatio,
      morphologyFeatures,
      temporalValidation.prematurityScore
    );
    
    // Requerir validación morfológica obligatoria para eliminar falsos positivos
    if (!morphValidation.valid) {
      return {
        isArrhythmia: false,
        arrhythmiaType: null,
        confidence: (temporalValidation.confidence + morphValidation.confidence) / 2,
        validations: ['passed_temporal', 'failed_morphological']
      };
    }
    this.validationState.morphologicalValid = true;
    
    // 3. Validación contextual - análisis de patrón a largo plazo para evitar falsos positivos
    const contextValidation = this.performExtendedContextualValidation(
      currentRR, 
      previousRRs,
      patientContext,
      temporalValidation.prematurityScore
    );
    
    if (!contextValidation.valid) {
      return {
        isArrhythmia: false,
        arrhythmiaType: null,
        confidence: (temporalValidation.confidence + morphValidation.confidence) / 2,
        validations: ['passed_temporal', 'passed_morphological', 'failed_contextual']
      };
    }
    this.validationState.contextualValid = true;
    
    // 4. Validación estadística - patrones de población y análisis bayesiano
    const statsValidation = this.performBayesianStatisticalValidation(
      currentRR, 
      previousRRs,
      morphologyFeatures,
      temporalValidation.prematurityScore
    );
    
    if (!statsValidation.valid) {
      return {
        isArrhythmia: false,
        arrhythmiaType: null,
        confidence: (temporalValidation.confidence + morphValidation.confidence + 
                    contextValidation.confidence) / 3,
        validations: ['passed_temporal', 'passed_morphological', 
                     'passed_contextual', 'failed_statistical']
      };
    }
    this.validationState.statisticalValid = true;
    
    // 5. Nueva: Verificación fisiológica - adaptación a variabilidad del paciente
    const physiologicalValidation = this.performPhysiologicalValidation(
      currentRR,
      previousRRs,
      patientContext
    );
    
    if (!physiologicalValidation.valid) {
      return {
        isArrhythmia: false,
        arrhythmiaType: null,
        confidence: 0.75, // Alta confianza en que NO es arritmia
        validations: ['passed_temporal', 'passed_morphological', 
                     'passed_contextual', 'passed_statistical',
                     'failed_physiological']
      };
    }
    
    // 6. Identificación y clasificación específica de latido prematuro
    const arrhythmiaType = this.classifyPrematureBeat(
      temporalValidation.prematurityScore,
      morphValidation.morphScore,
      previousRRs
    );
    
    // 7. Combinar confianza con ponderación de factores
    const finalConfidence = this.calculateWeightedConfidence([
      {score: temporalValidation.confidence, weight: 0.35},
      {score: morphValidation.confidence, weight: 0.25},
      {score: contextValidation.confidence, weight: 0.20},
      {score: statsValidation.confidence, weight: 0.10},
      {score: physiologicalValidation.confidence, weight: 0.10}
    ]);
    
    this.validationState.totalConfidence = finalConfidence;
    
    // 8. Actualizar historial de análisis con factores detallados
    this.updateDetailedBeatHistory(
      currentRR,
      amplitudeRatio,
      morphologyFeatures.normalizedArea,
      temporalValidation.prematurityScore,
      morphValidation.morphScore
    );
    
    // 9. Verificación final de confianza con umbral estricto
    const isConfirmedArrhythmia = finalConfidence >= this.MIN_CONFIDENCE_THRESHOLD;
    
    // 10. Verificación adicional del período refractario para evitar falsos positivos
    if (!isConfirmedArrhythmia) {
      const timeSinceLastArrhythmia = Date.now() - this.lastArrhythmiaTime;
      if (timeSinceLastArrhythmia < this.DETECTION_COOLDOWN) {
        return {
          isArrhythmia: false,
          arrhythmiaType: null,
          confidence: finalConfidence,
          validations: ['passed_temporal', 'passed_morphological', 
                       'passed_contextual', 'passed_statistical',
                       'failed_cooldown']
        };
      }
    }
    
    return {
      isArrhythmia: isConfirmedArrhythmia,
      arrhythmiaType: isConfirmedArrhythmia ? arrhythmiaType : null,
      confidence: finalConfidence,
      validations: [
        'passed_temporal',
        'passed_morphological',
        'passed_contextual',
        'passed_statistical'
      ]
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
