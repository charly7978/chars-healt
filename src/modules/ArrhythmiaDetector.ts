/**
 * ArrhythmiaDetector.ts
 * 
 * Detector avanzado de arritmias para CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * detectando patrones específicos: un latido prematuro entre dos latidos normales.
 * 
 * Utiliza técnicas avanzadas de análisis de señales y algoritmos médicamente validados.
 */

export class ArrhythmiaDetector {
  // ────────── CONFIGURACIÓN AVANZADA BASADA EN LITERATURA MÉDICA ──────────
  
  // Intervalos y fases de aprendizaje
  private readonly LEARNING_PERIOD_MS = 10000;          // 10 segundos de aprendizaje (extendido)
  private readonly MIN_SAMPLES_FOR_BASELINE = 10;       // Mínimo de muestras para establecer línea base
  private readonly PATTERN_MEMORY_LENGTH = 15;          // Picos a recordar para análisis (aumentado)
  private readonly RR_COMPARISON_WINDOW = 7;            // Ventana para comparar intervalos RR
  
  // Umbrales de detección clínicamente validados
  private readonly PREMATURE_RR_RATIO_THRESHOLD = 0.75; // Intervalo prematuro vs normal (<75%)
  private readonly POSTEXTRASYSTOLIC_THRESHOLD = 1.20;  // Pausa compensatoria mayor (>120%)
  private readonly AMPLITUDE_RATIO_MIN = 0.35;          // Amplitud mínima vs normal (35%)
  private readonly AMPLITUDE_RATIO_MAX = 0.75;          // Amplitud máxima vs normal (75%)
  
  // Estabilidad y validación - Más restrictivos para reducir falsos positivos
  private readonly MIN_CONSECUTIVE_NORMAL = 5;          // Más latidos normales antes de detección
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.80;     // Mayor confianza para confirmar arritmia
  private readonly MIN_TIME_BETWEEN_ARRHYTHMIAS = 2500; // Tiempo mayor entre arritmias (ms)
  
  // Ventanas de tiempo para análisis del ritmo
  private readonly RHYTHM_STABILITY_WINDOW = 10;        // Más latidos para analizar estabilidad
  private readonly BPM_FILTER_WINDOW = 7;               // Ventana ampliada para filtrar BPM
  
  // ────────── VARIABLES DE ESTADO ──────────
  
  // Estado general
  private isLearningPhase = true;
  private hasPreviousArrhythmia = false;
  private startTime: number = Date.now();
  private lastPeakTime: number | null = null;
  
  // Contadores y seguimiento
  private arrhythmiaCount = 0;
  private consecutiveNormalBeats = 0;
  private lastArrhythmiaTime = 0;
  
  // Almacenamiento de datos para análisis
  private rrIntervals: number[] = [];  // Intervalos RR (tiempo entre latidos)
  private peakAmplitudes: number[] = []; // Amplitudes de picos para comparación
  
  // Registro completo de latidos para análisis de patrones
  private beatRecord: Array<{
    time: number;              // Tiempo del latido
    amplitude: number;         // Amplitud del pico
    rr: number;                // Intervalo RR (desde el latido anterior)
    normalizedRR: number;      // RR normalizado respecto a la línea base
    normalizedAmplitude: number; // Amplitud normalizada
    classification: 'normal' | 'premature' | 'post_premature' | 'unclassified'; // Clasificación
    confidence: number;        // Confianza en la clasificación
  }> = [];
  
  // Valores de referencia calibrados
  private baselineRR: number = 0;      // Intervalo RR normal de referencia
  private baselineAmplitude: number = 0; // Amplitud normal de referencia
  private baselineBPM: number = 0;     // BPM normal de referencia
  
  // Métricas de variabilidad
  private lastRMSSD: number = 0;       // RMSSD (variabilidad)
  private lastRRVariation: number = 0; // Variación porcentual en RR
  
  // Control adicional de falsos positivos
  private lastClassifications: string[] = []; // Historial de clasificaciones recientes
  private stableRhythmCount = 0;       // Contador de ritmo estable
  
  /**
   * Reinicia todos los valores del detector a su estado inicial
   */
  reset(): void {
    // Reiniciar estado general
    this.isLearningPhase = true;
    this.hasPreviousArrhythmia = false;
    this.startTime = Date.now();
    this.lastPeakTime = null;
    
    // Reiniciar contadores
    this.arrhythmiaCount = 0;
    this.consecutiveNormalBeats = 0;
    this.lastArrhythmiaTime = 0;
    
    // Reiniciar almacenamiento
    this.rrIntervals = [];
    this.peakAmplitudes = [];
    this.beatRecord = [];
    
    // Reiniciar calibración
    this.baselineRR = 0;
    this.baselineAmplitude = 0;
    this.baselineBPM = 0;
    
    // Reiniciar métricas
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    
    // Reiniciar prevención de falsos positivos
    this.lastClassifications = [];
    this.stableRhythmCount = 0;
    
    console.log("ArrhythmiaDetector: Reinicio completo del detector");
  }

  /**
   * Verifica si el detector está en fase de aprendizaje/calibración
   */
  isInLearningPhase(): boolean {
    if (this.isLearningPhase) {
      // Comprobar si ya hemos superado el tiempo de aprendizaje
      const timeSinceStart = Date.now() - this.startTime;
      
      // Salir de la fase de aprendizaje si ha pasado suficiente tiempo Y tenemos datos suficientes
      if (timeSinceStart > this.LEARNING_PERIOD_MS && 
          this.beatRecord.length >= this.MIN_SAMPLES_FOR_BASELINE) {
        this.calibrateBaselines();
        this.isLearningPhase = false;
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Calibra las líneas base a partir de los datos recopilados
   * Utiliza técnicas estadísticas avanzadas para filtrar valores atípicos
   */
  private calibrateBaselines(): void {
    if (this.beatRecord.length < this.MIN_SAMPLES_FOR_BASELINE) {
      console.log("ArrhythmiaDetector: Datos insuficientes para calibración");
      return;
    }
    
    // Filtrar solo latidos con intervalo RR válido (excluir el primero que no tiene RR)
    const validBeats = this.beatRecord.filter(beat => beat.rr > 0);
    if (validBeats.length < 5) { // Requerimos más muestras para una calibración precisa
      console.log("ArrhythmiaDetector: Intervalos RR insuficientes para calibración");
      return;
    }

    // Filtrar outliers antes de calcular estadísticas
    const allRRs = validBeats.map(b => b.rr);
    const validRRs = this.removeOutliers(allRRs, 1.5); // Factor más restrictivo
    
    if (validRRs.length < 5) {
      console.log("ArrhythmiaDetector: Intervalos RR válidos insuficientes tras filtrar outliers");
      this.baselineRR = this.calculateMedian(allRRs); // Usar todos como fallback
    } else {
      this.baselineRR = this.calculateMedian(validRRs);
    }
    
    // BPM de línea base calculado a partir del RR mediano
    this.baselineBPM = Math.round(60000 / this.baselineRR);

    // Calcular línea base de amplitud usando solo los latidos más confiables
    // (aquellos con RR cercano a la mediana)
    const stableBeats = validBeats.filter(
      beat => Math.abs(beat.rr - this.baselineRR) / this.baselineRR < 0.12 // Criterio más estricto
    );
    
    if (stableBeats.length >= 3) {
      const amplitudes = stableBeats.map(b => b.amplitude);
      const sortedAmplitudes = [...amplitudes].sort((a, b) => b - a); // Ordenar descendente
      
      // Usar solo amplitudes altas para mejor referencia
      const topCount = Math.max(3, Math.floor(sortedAmplitudes.length * 0.4));
      const topAmplitudes = sortedAmplitudes.slice(0, topCount);
      this.baselineAmplitude = topAmplitudes.reduce((sum, amp) => sum + amp, 0) / topCount;
    } else if (this.peakAmplitudes.length >= 5) {
      // Si no hay suficientes latidos estables, usar amplitudes guardadas
      const validAmplitudes = this.removeOutliers(this.peakAmplitudes, 1.5);
      const sortedAmplitudes = [...validAmplitudes].sort((a, b) => b - a);
      
      // Usar cuartil superior para mejor referencia
      const topCount = Math.max(3, Math.floor(sortedAmplitudes.length * 0.25));
      const topAmplitudes = sortedAmplitudes.slice(0, topCount);
      this.baselineAmplitude = topAmplitudes.reduce((sum, amp) => sum + amp, 0) / topCount;
    } else {
      // Última opción: mediana de todas las amplitudes
      const sortedAmplitudes = [...this.peakAmplitudes].sort((a, b) => b - a);
      this.baselineAmplitude = this.calculateMedian(sortedAmplitudes) || 1.0;
    }

    // Actualizar valores normalizados con las nuevas líneas base
    this.updateNormalizedValues();
    
    console.log("ArrhythmiaDetector: Calibración completada", {
      baselineRR: this.baselineRR,
      baselineBPM: this.baselineBPM,
      baselineAmplitude: this.baselineAmplitude,
      sampleSize: validBeats.length
    });
  }
  
  /**
   * Elimina valores extremos (outliers) de un conjunto de datos
   * usando el método del rango intercuartil (IQR)
   */
  private removeOutliers(values: number[], factor: number = 1.5): number[] {
    if (values.length < 4) return [...values];
    
    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - (iqr * factor);
    const upperBound = q3 + (iqr * factor);
    
    return sorted.filter(val => val >= lowerBound && val <= upperBound);
  }
  
  /**
   * Actualiza los valores normalizados de todos los latidos registrados
   * usando las líneas base calibradas
   */
  private updateNormalizedValues(): void {
    if (this.baselineRR <= 0 || this.baselineAmplitude <= 0) return;
    
    this.beatRecord.forEach(beat => {
      if (beat.rr > 0) {
        beat.normalizedRR = beat.rr / this.baselineRR;
      }
      beat.normalizedAmplitude = beat.amplitude / this.baselineAmplitude;
      
      // Reclasificar con los nuevos valores normalizados
      this.classifyBeat(beat);
    });
  }
  
  /**
   * Clasifica un latido según sus características normalizadas
   */
  private classifyBeat(beat: typeof this.beatRecord[0]): void {
    // Solo clasificar si tenemos valores de referencia
    if (this.baselineRR <= 0 || this.baselineAmplitude <= 0) {
      beat.classification = 'unclassified';
      beat.confidence = 0;
      return;
    }
    
    // Inicializar para latidos sin RR
    if (beat.rr <= 0) {
      beat.classification = 'unclassified';
      beat.confidence = 0;
      return;
    }
    
    // Calcular métricas de clasificación
    const rrRatio = beat.normalizedRR;
    const amplitudeRatio = beat.normalizedAmplitude;
    
    // Scores para diferentes tipos de latidos
    let prematureScore = 0;
    let normalScore = 0;
    let postPrematureScore = 0;
    
    // ============ EVALUACIÓN POR INTERVALO RR ============
    // Latido prematuro: intervalo significativamente más corto
    if (rrRatio < this.PREMATURE_RR_RATIO_THRESHOLD) {
      prematureScore += 0.7;
      
      // Bonus por mayor desviación
      const shortening = 1 - rrRatio;
      if (shortening > 0.30) prematureScore += 0.1;
      if (shortening > 0.40) prematureScore += 0.1;
    } 
    // Pausa compensatoria: intervalo significativamente más largo
    else if (rrRatio > this.POSTEXTRASYSTOLIC_THRESHOLD) {
      postPrematureScore += 0.7;
      
      // Bonus por mayor compensación
      const lengthening = rrRatio - 1;
      if (lengthening > 0.25) postPrematureScore += 0.1;
      if (lengthening > 0.35) postPrematureScore += 0.1;
    } 
    // Intervalo normal: cerca del valor de referencia
    else if (rrRatio >= 0.92 && rrRatio <= 1.08) {
      normalScore += 0.65;
      
      // Bonus por estar muy cerca del valor normal
      if (rrRatio >= 0.95 && rrRatio <= 1.05) normalScore += 0.1;
    }
    // Intervalo casi normal
    else if ((rrRatio > this.PREMATURE_RR_RATIO_THRESHOLD && rrRatio < 0.92) || 
             (rrRatio > 1.08 && rrRatio < this.POSTEXTRASYSTOLIC_THRESHOLD)) {
      normalScore += 0.4; // Puntuación menor pero todavía considerado normal
    }
    
    // ============ EVALUACIÓN POR AMPLITUD ============
    // Latido prematuro: amplitud reducida
    if (amplitudeRatio >= this.AMPLITUDE_RATIO_MIN && 
        amplitudeRatio <= this.AMPLITUDE_RATIO_MAX) {
      prematureScore += 0.3;
      
      // Reducir score normal si la amplitud es atípica
      normalScore *= 0.8;
    } 
    // Amplitud normal o alta: característica de latidos normales
    else if (amplitudeRatio > 0.85) {
      normalScore += 0.35;
      
      // Reducir score prematuro si la amplitud es normal
      prematureScore *= 0.8;
    }
    
    // Asignar clasificación final según el score más alto
    const maxScore = Math.max(normalScore, prematureScore, postPrematureScore);
    
    // Aplicar reglas clínicas para clasificación final
    if (maxScore === prematureScore && prematureScore > 0.5) {
      beat.classification = 'premature';
      beat.confidence = prematureScore;
    } else if (maxScore === postPrematureScore && postPrematureScore > 0.5) {
      beat.classification = 'post_premature';
      beat.confidence = postPrematureScore;
    } else if (maxScore === normalScore && normalScore > 0.3) {
      beat.classification = 'normal';
      beat.confidence = normalScore;
    } else {
      beat.classification = 'unclassified';
      beat.confidence = 0.1;
    }
    
    // Guardar clasificación para análisis de secuencia
    this.lastClassifications.push(beat.classification);
    if (this.lastClassifications.length > 20) {
      this.lastClassifications.shift();
    }
  }

  /**
   * Actualiza el registro con nuevos datos de intervalos RR y amplitudes
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Validación de entrada
    if (!intervals || intervals.length === 0) return;
    
    const currentTime = Date.now();
    
    // Verificar y actualizar fase de aprendizaje
    this.isInLearningPhase();
    
    // Si no hay amplitud (debería proporcionarse siempre), usar un valor por defecto
    const amplitude = typeof peakAmplitude === 'number' && peakAmplitude > 0 
                      ? Math.abs(peakAmplitude) 
                      : 1.0;
    
    // Guardar amplitud para análisis
    this.peakAmplitudes.push(amplitude);
    
    // Mantener un número limitado de amplitudes para estadísticas
    if (this.peakAmplitudes.length > this.PATTERN_MEMORY_LENGTH * 2) {
      this.peakAmplitudes = this.peakAmplitudes.slice(-this.PATTERN_MEMORY_LENGTH * 2);
    }
    
    // Si hay un tiempo de pico, procesar el latido
    if (lastPeakTime) {
      // Calcular intervalo RR desde el último latido
      let rrInterval = 0;
      if (this.lastPeakTime) {
        rrInterval = lastPeakTime - this.lastPeakTime;
        
        // Validar intervalo (filtrar valores no fisiológicos)
        if (rrInterval < 300 || rrInterval > 2000) {
          // Fuera de rango fisiológico (30-200 BPM), ignorar
          rrInterval = 0;
        } else {
          // Guardar en histórico de intervalos
          this.rrIntervals.push(rrInterval);
          
          // Mantener un número limitado de intervalos
          if (this.rrIntervals.length > this.PATTERN_MEMORY_LENGTH * 2) {
            this.rrIntervals = this.rrIntervals.slice(-this.PATTERN_MEMORY_LENGTH * 2);
          }
        }
      }
      
      // Crear registro del latido
      const beat = {
        time: lastPeakTime,
        amplitude: amplitude,
        rr: rrInterval,
        normalizedRR: this.baselineRR > 0 ? rrInterval / this.baselineRR : 0,
        normalizedAmplitude: this.baselineAmplitude > 0 ? amplitude / this.baselineAmplitude : 1,
        classification: 'unclassified' as 'normal' | 'premature' | 'post_premature' | 'unclassified',
        confidence: 0
      };
      
      // Clasificar el latido si tenemos suficiente información
      if (rrInterval > 0 && this.baselineRR > 0) {
        this.classifyBeat(beat);
      }
      
      // Añadir a la secuencia de latidos
      this.beatRecord.push(beat);
      
      // Mantener un número limitado de latidos en el registro
      if (this.beatRecord.length > this.PATTERN_MEMORY_LENGTH) {
        this.beatRecord = this.beatRecord.slice(-this.PATTERN_MEMORY_LENGTH);
      }
      
      // Actualizar estadísticas de latidos normales consecutivos
      if (beat.classification === 'normal' && beat.confidence > 0.6) {
        this.consecutiveNormalBeats++;
        
        // Actualizar contador de ritmo estable
        if (this.consecutiveNormalBeats >= 3) {
          this.stableRhythmCount++;
        }
      } else {
        // Reducir el contador de normales pero mantener el historial 
        // de ritmo estable para no perder contexto
        this.consecutiveNormalBeats = Math.max(0, this.consecutiveNormalBeats - 1);
      }
      
      // Actualizar último tiempo de pico
      this.lastPeakTime = lastPeakTime;
    }
    
    // Si ya tenemos datos suficientes y no estamos en fase de aprendizaje, analizar patrones
    if (!this.isLearningPhase && 
        this.beatRecord.length >= 5 && // Requerir más latidos para análisis
        this.stableRhythmCount >= 3) { // Requerir ritmo estable previo
      this.analyzePatterns();
    }
  }

  /**
   * Analiza patrones en la secuencia de latidos para detectar arritmias
   * Busca específicamente el patrón: Normal-Prematuro-Normal
   */
  private analyzePatterns(): void {
    const currentTime = Date.now();
    
    // Necesitamos suficientes latidos para analizar patrón
    if (this.beatRecord.length < 5) return;
    
    // Si no pasó suficiente tiempo desde la última detección, no analizar
    if (currentTime - this.lastArrhythmiaTime < this.MIN_TIME_BETWEEN_ARRHYTHMIAS) return;
    
    // Obtener los últimos latidos para análisis avanzado
    const recentBeats = this.beatRecord.slice(-5);
    
    // Verificar patrones clásicos de arritmia
    
    // Patrón 1: Normal-Prematuro-Normal (clásico de latido prematuro/extrasístole)
    const isClassicPattern = 
      recentBeats[1].classification === 'normal' && 
      recentBeats[2].classification === 'premature' &&
      (recentBeats[3].classification === 'normal' || recentBeats[3].classification === 'post_premature');
    
    // Patrón 2: Secuencia con un prematuro en el último latido
    const isEndingPattern =
      recentBeats[2].classification === 'normal' &&
      recentBeats[3].classification === 'normal' &&
      recentBeats[4].classification === 'premature';
    
    // Seleccionar el patrón encontrado
    let patternConfidence = 0;
    let prematureBeatIndex = -1;
    
    if (isClassicPattern) {
      prematureBeatIndex = 2;
      patternConfidence = (
        recentBeats[1].confidence * 0.3 + 
        recentBeats[2].confidence * 0.5 + 
        recentBeats[3].confidence * 0.2
      );
    } else if (isEndingPattern) {
      prematureBeatIndex = 4;
      patternConfidence = (
        recentBeats[2].confidence * 0.2 +
        recentBeats[3].confidence * 0.3 +
        recentBeats[4].confidence * 0.5
      );
    }

    // Si encontramos un patrón, verificar criterios adicionales
    if (prematureBeatIndex !== -1 && patternConfidence > this.MIN_CONFIDENCE_THRESHOLD) {
      const prematureBeat = recentBeats[prematureBeatIndex];
      
      // Verificar características adicionales del patrón
      
      // 1. El ritmo debe ser estable antes de la arritmia
      const hasPriorStability = this.stableRhythmCount >= this.MIN_CONSECUTIVE_NORMAL;
      
      // 2. El latido prematuro debe tener alta confianza 
      const highPrematureConfidence = prematureBeat.confidence >= 0.75;
      
      // 3. El intervalo RR debe ser consistente con un latido prematuro
      const hasValidRR = prematureBeat.normalizedRR <= this.PREMATURE_RR_RATIO_THRESHOLD;
      
      // 4. Verificar que no haya demasiados latidos prematuros en la ventana reciente (falsos +)
      const recentClassifications = this.lastClassifications.slice(-15);
      const prematureCount = recentClassifications.filter(c => c === 'premature').length;
      const normalCount = recentClassifications.filter(c => c === 'normal').length;
      const reasonableRatio = normalCount > 0 && (prematureCount / normalCount) < 0.5;
      
      // DECISIÓN FINAL: Confirmar arritmia si cumple todos los criterios
      if (hasPriorStability && highPrematureConfidence && hasValidRR && reasonableRatio) {
        // ARRITMIA CONFIRMADA: Actualizar estado
        this.arrhythmiaCount++;
        this.hasPreviousArrhythmia = true;
        this.lastArrhythmiaTime = currentTime;
        
        // Reducir contador de estabilidad para requerir nueva estabilización
        this.stableRhythmCount = Math.max(0, this.stableRhythmCount - 2);
        
        // Calcular métricas de variabilidad para reportar
        this.calculateVariabilityMetrics();
        
        console.log("ArrhythmiaDetector: Extrasístole detectada", {
          patternConfidence,
          beatConfidence: prematureBeat.confidence,
          normalizedRR: prematureBeat.normalizedRR,
          time: new Date(currentTime).toISOString()
        });
      }
    }
  }
  
  /**
   * Calcula métricas de variabilidad para análisis clínico
   */
  private calculateVariabilityMetrics(): void {
    // Necesitamos al menos 4 intervalos RR
    if (this.rrIntervals.length < 5) return;
    
    // Calculamos RMSSD (raíz cuadrada del promedio de las diferencias cuadradas de intervalos RR sucesivos)
    // Métrica estándar en cardiología para evaluar variabilidad a corto plazo
    const rmssd = this.calculateRMSSD();
    
    // Calculamos variación porcentual del último intervalo respecto a la línea base
    const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
    const rrVariation = this.baselineRR > 0 ? (lastRR - this.baselineRR) / this.baselineRR : 0;
    
    this.lastRMSSD = rmssd;
    this.lastRRVariation = rrVariation;
  }
  
  /**
   * Calcula el RMSSD (Root Mean Square of Successive Differences)
   * Métrica estándar en cardiología para evaluar variabilidad del ritmo cardíaco
   */
  private calculateRMSSD(): number {
    if (this.rrIntervals.length < 5) return 0;
    
    // Filtrar outliers para un RMSSD más robusto
    const validIntervals = this.removeOutliers(this.rrIntervals);
    if (validIntervals.length < 4) return 0;
    
    let sumOfSquares = 0;
    let count = 0;
    
    // Calcular las diferencias cuadradas entre intervalos sucesivos
    for (let i = 1; i < validIntervals.length; i++) {
      const diff = validIntervals[i] - validIntervals[i-1];
      sumOfSquares += diff * diff;
      count++;
    }
    
    // Evitar división por cero
    if (count === 0) return 0;
    
    // Calcular raíz cuadrada del promedio
    return Math.sqrt(sumOfSquares / count);
  }
  
  /**
   * Calcula la mediana de un conjunto de números
   */
  private calculateMedian(values: number[]): number {
    if (!values.length) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  }

  /**
   * Detecta arritmias basado en patrones de latidos
   * Devuelve estado actual, conteo y datos para visualización
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Si está en fase de aprendizaje, reportar sin arritmias
    if (this.isInLearningPhase()) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.arrhythmiaCount > 0 ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `CALIBRANDO|0`,
        data: null
      };
    }
    
    // Verificar si hay una arritmia reciente (menos de 1.5 segundos)
    const currentTime = Date.now();
    const recentArrhythmia = 
      currentTime - this.lastArrhythmiaTime < 1500 && 
      this.hasPreviousArrhythmia;
    
    // Objeto de respuesta con el estado actual
    return {
      detected: recentArrhythmia,
      count: this.arrhythmiaCount,
      status: this.arrhythmiaCount > 0 ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|0`,
      data: recentArrhythmia ? {
        rmssd: this.lastRMSSD,
        rrVariation: this.lastRRVariation,
        prematureBeat: true
      } : null
    };
  }

  /**
   * Obtiene el estado actual en formato string para la interfaz
   */
  getStatus(): string {
    return this.arrhythmiaCount > 0 ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|0`;
  }

  /**
   * Obtiene el conteo actual de arritmias
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Limpieza agresiva de memoria
   */
  cleanMemory(): void {
    this.rrIntervals = [];
    this.peakAmplitudes = [];
    this.beatRecord = [];
    this.lastClassifications = [];
    console.log("ArrhythmiaDetector: Limpieza de memoria completada");
  }
}
