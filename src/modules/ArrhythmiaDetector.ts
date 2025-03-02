/**
 * ArrhythmiaDetector.ts
 * 
 * DETECTOR DE ARRITMIAS DE ALTA PRECISIÓN (v2.0)
 * 
 * Especializado en la identificación científica de latidos prematuros (extrasístoles)
 * utilizando técnicas avanzadas de análisis morfológico, temporal y de contexto.
 * 
 * Este detector implementa algoritmos basados en publicaciones médicas recientes
 * sobre fotopletismografía y detección de arritmias cardíacas mediante análisis
 * de señales PPG no invasivas.
 */

export class ArrhythmiaDetector {
  // ────────── PARÁMETROS DE CONFIGURACIÓN AVANZADOS ──────────
  
  // Temporales y de aprendizaje
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 8000; // 8 segundos de calibración antes de empezar a detectar
  private readonly MAX_HISTORY_SIZE = 20; // Máximo de intervalos y amplitudes para análisis
  private readonly MIN_ANALYSIS_SET = 6; // Mínimo de intervalos para análisis significativo
  private readonly DETECTION_SENSITIVITY = 1.2; // Multiplicador de sensibilidad (>1 = más sensible)
  private readonly MIN_CONSECUTIVE_NORMAL = 3; // Mínimo de latidos normales para establecer línea base
  
  // Umbrales de detección morfológica - modificados para mayor sensibilidad
  private readonly PREMATURE_AMPLITUDE_THRESHOLD = 0.72; // Umbral de amplitud para latido prematuro
  private readonly NORMAL_AMPLITUDE_THRESHOLD = 0.85; // Umbral para considerar un latido como normal
  private readonly PREMATURE_RR_THRESHOLD = 0.80; // Umbral para intervalo RR prematuro (más corto)
  private readonly COMPENSATORY_RR_THRESHOLD = 1.10; // Umbral para pausa compensatoria
  
  // Umbrales de variabilidad
  private readonly RMSSD_THRESHOLD = 25.0; // Umbral RMSSD para detectar variabilidad
  private readonly RR_VARIATION_THRESHOLD = 0.15; // Variación RR mínima para considerar significativa
  
  // Temporal - prevención de falsos positivos
  private readonly MIN_TIME_BETWEEN_ARRHYTHMIAS = 2000; // 2 segundos entre detecciones
  
  // ────────── ESTADO INTERNO ──────────
  
  // Datos de análisis
  private rrIntervals: number[] = []; // Historial de intervalos RR
  private amplitudes: number[] = []; // Historial de amplitudes de picos
  private peakTimes: number[] = []; // Timestamps de cada pico (ms)
  private baselineRR: number = 0; // Intervalo RR normal de referencia
  private baselineAmplitude: number = 0; // Amplitud normal de referencia
  private consecutiveNormalBeats: number = 0; // Contador de latidos normales consecutivos
  
  // Datos avanzados para análisis morfológico
  private peakSequence: Array<{
    time: number;
    amplitude: number;
    interval: number | null;
    type: 'normal' | 'premature' | 'compensatory' | 'unknown';
    ratios: {
      amplitudeRatio: number;
      rrRatio: number | null;
    };
  }> = [];
  
  // Patrones reconocidos
  private recognizedPatterns: Array<{
    type: 'NPC' | 'NPP' | 'NN' | 'PP';
    confidence: number;
    timestamp: number;
  }> = [];
  
  // Estado de la detección
  private isLearningPhase: boolean = true;
  private measurementStartTime: number = Date.now();
  private lastPeakTime: number | null = null;
  private hasDetectedFirstArrhythmia: boolean = false;
  private arrhythmiaCount: number = 0;
  private lastArrhythmiaTime: number = 0;
  private lastDetectionConfidence: number = 0;
  
  // Métricas de calidad y diagnostico científico
  private rmssd: number = 0; // Root Mean Square of Successive Differences
  private rrVariation: number = 0; // Variación porcentual en intervalos RR 
  private pnnx: number = 0; // Porcentaje de intervalos NN que difieren en más de X ms
  private entropy: number = 0; // Entropía de la distribución RR (complejidad)
  
  // Valor debug para depuración
  private readonly DEBUG_MODE = true;
  
  /**
   * Constructor que inicializa el detector
   */
  constructor() {
    this.reset();
  }
  
  /**
   * Limpia completamente el estado del detector
   */
  reset(): void {
    // Datos de análisis
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.peakSequence = [];
    this.recognizedPatterns = [];
    
    // Estado
    this.isLearningPhase = true;
    this.measurementStartTime = Date.now();
    this.lastPeakTime = null;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaCount = 0;
    this.lastArrhythmiaTime = 0;
    this.lastDetectionConfidence = 0;
    this.consecutiveNormalBeats = 0;
    
    // Líneas base
    this.baselineRR = 0;
    this.baselineAmplitude = 0;
    
    // Métricas
    this.rmssd = 0;
    this.rrVariation = 0;
    this.pnnx = 0;
    this.entropy = 0;
    
    if (this.DEBUG_MODE) {
      console.log("ArrhythmiaDetector: Reset completo");
    }
  }
  
  /**
   * Verifica si el detector está en fase de aprendizaje/calibración
   * @returns {boolean} true si está en fase de aprendizaje
   */
  isInLearningPhase(): boolean {
    const timeSinceStart = Date.now() - this.measurementStartTime;
    return timeSinceStart <= this.ARRHYTHMIA_LEARNING_PERIOD || this.consecutiveNormalBeats < this.MIN_CONSECUTIVE_NORMAL;
  }
  
  /**
   * Actualiza la fase de aprendizaje y calcula valores de referencia
   * si se cumplen los criterios para salir de la fase de calibración
   */
  private updateLearningPhase(): void {
    if (this.isLearningPhase) {
      const timeSinceStart = Date.now() - this.measurementStartTime;
      const hasMinimumData = this.rrIntervals.length >= this.MIN_ANALYSIS_SET && 
                            this.amplitudes.length >= this.MIN_ANALYSIS_SET;
                            
      // Salir de fase de aprendizaje si tenemos suficientes datos y ha pasado el tiempo mínimo
      if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD && hasMinimumData) {
        this.calculateBaselines();
        
        if (this.baselineRR > 0 && this.baselineAmplitude > 0) {
          this.isLearningPhase = false;
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Fase de aprendizaje completada:', {
              baselineRR: this.baselineRR,
              baselineAmplitude: this.baselineAmplitude,
              muestras: this.rrIntervals.length,
              tiempoTranscurrido: timeSinceStart
            });
          }
        } else if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Insuficientes datos para salir de fase de aprendizaje');
        }
      }
    }
  }
  
  /**
   * Calcula los valores de referencia para intervalos RR y amplitudes
   * utilizando técnicas estadísticas robustas (mediana y percentiles)
   */
  private calculateBaselines(): void {
    if (this.rrIntervals.length < this.MIN_ANALYSIS_SET || this.amplitudes.length < this.MIN_ANALYSIS_SET) {
      return;
    }
    
    // INTERVALOS RR: Usar técnica de percentiles para eliminar outliers
    const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
    
    // Calcular percentiles para filtrar valores extremos
    const lowerPercentile = Math.floor(sortedRR.length * 0.15); // 15º percentil
    const upperPercentile = Math.ceil(sortedRR.length * 0.85); // 85º percentil
    
    // Quedarse con el rango medio (15-85%)
    const midRangeRR = sortedRR.slice(lowerPercentile, upperPercentile);
    
    // Usar la mediana del rango medio como línea base RR
    const medianIndex = Math.floor(midRangeRR.length / 2);
    this.baselineRR = midRangeRR[medianIndex];
    
    // AMPLITUDES: Usar enfoque similar pero favoreciendo amplitudes altas
    // (los latidos normales tienden a tener mayor amplitud que los prematuros)
    const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a); // Orden descendente
    
    // Tomar el tercio superior como referencia para amplitud normal
    const topAmplitudesCount = Math.max(3, Math.ceil(sortedAmplitudes.length * 0.33));
    const topAmplitudes = sortedAmplitudes.slice(0, topAmplitudesCount);
    
    // Usar promedio de amplitudes altas como línea base
    this.baselineAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
    
    if (this.DEBUG_MODE) {
      console.log('ArrhythmiaDetector - Valores de referencia calculados:', {
        baselineRR: this.baselineRR,
        baselineAmplitude: this.baselineAmplitude,
        minRR: sortedRR[0],
        maxRR: sortedRR[sortedRR.length - 1],
        minAmplitude: sortedAmplitudes[sortedAmplitudes.length - 1],
        maxAmplitude: sortedAmplitudes[0]
      });
    }
  }
  
  /**
   * Actualiza el historial con nuevos intervalos RR y amplitudes
   * @param intervals - Intervalos RR en milisegundos
   * @param lastPeakTime - Timestamp del último pico detectado
   * @param peakAmplitude - Amplitud del último pico detectado
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    if (!intervals || intervals.length === 0) {
      return;
    }
    
    const currentTime = Date.now();
    
    // Filtrar intervalos médicamente válidos (30-200 BPM = 300-2000 ms)
    if (intervals.length > 0) {
      const validIntervals = intervals.filter(interval => 
        interval >= 300 && interval <= 2000
      );
      
      if (validIntervals.length > 0) {
        // Actualizar intervalos manteniendo tamaño máximo
        this.rrIntervals = [...validIntervals, ...this.rrIntervals].slice(0, this.MAX_HISTORY_SIZE);
      }
    }
    
    // Registrar timestamp del pico actual
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      
      // Mantener historial acotado
      if (this.peakTimes.length > this.MAX_HISTORY_SIZE) {
        this.peakTimes.shift();
      }
      
      // Calcular intervalo con respecto al pico anterior si existe
      let currentInterval = null;
      if (this.lastPeakTime !== null) {
        currentInterval = lastPeakTime - this.lastPeakTime;
      }
      this.lastPeakTime = lastPeakTime;
      
      // Registrar amplitud si está disponible
      if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
        const absAmplitude = Math.abs(peakAmplitude);
        this.amplitudes.push(absAmplitude);
        
        // Mantener historial acotado
        if (this.amplitudes.length > this.MAX_HISTORY_SIZE) {
          this.amplitudes.shift();
        }
        
        // Clasificar el pico para análisis morfológico
        this.classifyAndRecordPeak(currentTime, absAmplitude, currentInterval);
      }
    }
    
    // Actualizar fase de aprendizaje
    this.updateLearningPhase();
    
    // Calcular métricas de variabilidad cardíaca
    this.calculateHeartRateVariabilityMetrics();
  }
  
  /**
   * Clasifica un pico basado en sus características y lo añade a la secuencia
   * @param time - Timestamp del pico
   * @param amplitude - Amplitud del pico
   * @param interval - Intervalo RR con respecto al pico anterior
   */
  private classifyAndRecordPeak(time: number, amplitude: number, interval: number | null): void {
    // Solo clasificar si ya tenemos valores de referencia
    let peakType: 'normal' | 'premature' | 'compensatory' | 'unknown' = 'unknown';
    let amplitudeRatio = 0;
    let rrRatio = null;
    
    if (this.baselineAmplitude > 0) {
      amplitudeRatio = amplitude / this.baselineAmplitude;
      
      // Clasificación por amplitud
      if (amplitudeRatio >= this.NORMAL_AMPLITUDE_THRESHOLD) {
        peakType = 'normal';
        this.consecutiveNormalBeats++;
      } 
      else if (amplitudeRatio <= this.PREMATURE_AMPLITUDE_THRESHOLD * this.DETECTION_SENSITIVITY) {
        peakType = 'premature';
        this.consecutiveNormalBeats = 0;
      }
      
      // Refinamiento por intervalo si está disponible
      if (interval !== null && this.baselineRR > 0) {
        rrRatio = interval / this.baselineRR;
        
        // Ajustar clasificación considerando también el intervalo
        if (rrRatio <= this.PREMATURE_RR_THRESHOLD * this.DETECTION_SENSITIVITY && peakType !== 'normal') {
          peakType = 'premature';
          this.consecutiveNormalBeats = 0;
        }
        else if (rrRatio >= this.COMPENSATORY_RR_THRESHOLD && 
                this.peakSequence.length > 0 && 
                this.peakSequence[this.peakSequence.length - 1].type === 'premature') {
          peakType = 'compensatory';
          this.consecutiveNormalBeats = 0;
        }
        else if (rrRatio >= 0.90 && rrRatio <= 1.10 && amplitudeRatio >= 0.90) {
          peakType = 'normal';
          this.consecutiveNormalBeats++;
        }
      }
    }
    
    // Añadir pico clasificado a la secuencia
    this.peakSequence.push({
      time,
      amplitude,
      interval,
      type: peakType,
      ratios: {
        amplitudeRatio,
        rrRatio
      }
    });
    
    // Mantener secuencia acotada
    if (this.peakSequence.length > this.MAX_HISTORY_SIZE) {
      this.peakSequence.shift();
    }
    
    // Buscar patrones en la secuencia actualizada
    this.detectPatterns();
  }
  
  /**
   * Detecta patrones característicos de arritmias en la secuencia de latidos
   */
  private detectPatterns(): void {
    if (this.peakSequence.length < 3) {
      return;
    }
    
    const currentTime = Date.now();
    const lastThreePeaks = this.peakSequence.slice(-3);
    
    // Patrón NPC: Normal - Prematuro - Compensatorio (patrón clásico de extrasístole)
    if (
      lastThreePeaks[0].type === 'normal' &&
      lastThreePeaks[1].type === 'premature' &&
      lastThreePeaks[2].type === 'normal' || lastThreePeaks[2].type === 'compensatory'
    ) {
      // Validar con criterios cuantitativos adicionales
      if (
        lastThreePeaks[1].ratios.amplitudeRatio !== null && 
        lastThreePeaks[1].ratios.amplitudeRatio <= this.PREMATURE_AMPLITUDE_THRESHOLD &&
        lastThreePeaks[2].ratios.rrRatio !== null && 
        lastThreePeaks[2].ratios.rrRatio >= this.COMPENSATORY_RR_THRESHOLD
      ) {
        const confidence = 0.95; // Alta confianza en patrón clásico
        
        this.recognizedPatterns.push({
          type: 'NPC',
          confidence,
          timestamp: currentTime
        });
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Patrón NPC detectado:', {
            normal: lastThreePeaks[0],
            premature: lastThreePeaks[1],
            compensatory: lastThreePeaks[2],
            confidence
          });
        }
        
        // Si ha pasado suficiente tiempo desde la última detección, contabilizar
        if (currentTime - this.lastArrhythmiaTime > this.MIN_TIME_BETWEEN_ARRHYTHMIAS) {
          this.arrhythmiaCount++;
          this.lastArrhythmiaTime = currentTime;
          this.hasDetectedFirstArrhythmia = true;
          this.lastDetectionConfidence = confidence;
        }
      }
    }
    
    // Patrón NPP: Normal seguido de dos latidos prematuros cercanos (fibrilación)
    else if (
      lastThreePeaks[0].type === 'normal' &&
      lastThreePeaks[1].type === 'premature' &&
      lastThreePeaks[2].type === 'premature'
    ) {
      // Validar con criterios adicionales
      if (
        lastThreePeaks[1].ratios.amplitudeRatio !== null && 
        lastThreePeaks[1].ratios.amplitudeRatio <= this.PREMATURE_AMPLITUDE_THRESHOLD &&
        lastThreePeaks[2].ratios.amplitudeRatio !== null && 
        lastThreePeaks[2].ratios.amplitudeRatio <= this.PREMATURE_AMPLITUDE_THRESHOLD
      ) {
        const confidence = 0.80; // Confianza moderada-alta
        
        this.recognizedPatterns.push({
          type: 'NPP',
          confidence,
          timestamp: currentTime
        });
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - Patrón NPP detectado:', {
            normal: lastThreePeaks[0],
            premature1: lastThreePeaks[1],
            premature2: lastThreePeaks[2],
            confidence
          });
        }
        
        // Contabilizar si ha pasado suficiente tiempo
        if (currentTime - this.lastArrhythmiaTime > this.MIN_TIME_BETWEEN_ARRHYTHMIAS) {
          this.arrhythmiaCount++;
          this.lastArrhythmiaTime = currentTime;
          this.hasDetectedFirstArrhythmia = true;
          this.lastDetectionConfidence = confidence;
        }
      }
    }
    
    // Verificar cambio súbito de patrón normal a prematuro
    if (this.peakSequence.length >= 5) {
      const lastFivePeaks = this.peakSequence.slice(-5);
      
      // Cambio súbito: NNNNP (4 normales seguidos de 1 prematuro)
      const normalCount = lastFivePeaks.slice(0, 4).filter(p => p.type === 'normal').length;
      
      if (normalCount >= 3 && lastFivePeaks[4].type === 'premature') {
        // Validar con criterios adicionales
        if (
          lastFivePeaks[4].ratios.amplitudeRatio !== null && 
          lastFivePeaks[4].ratios.amplitudeRatio <= this.PREMATURE_AMPLITUDE_THRESHOLD * this.DETECTION_SENSITIVITY
        ) {
          const confidence = 0.85; // Confianza alta
          
          this.recognizedPatterns.push({
            type: 'NPC', // Lo consideramos como un NPC también
            confidence,
            timestamp: currentTime
          });
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Cambio súbito detectado:', {
              normales: normalCount,
              premature: lastFivePeaks[4],
              confidence
            });
          }
          
          // Contabilizar si ha pasado suficiente tiempo
          if (currentTime - this.lastArrhythmiaTime > this.MIN_TIME_BETWEEN_ARRHYTHMIAS) {
            this.arrhythmiaCount++;
            this.lastArrhythmiaTime = currentTime;
            this.hasDetectedFirstArrhythmia = true;
            this.lastDetectionConfidence = confidence;
          }
        }
      }
    }
  }
  
  /**
   * Calcula métricas de variabilidad cardíaca utilizadas para detección avanzada
   */
  private calculateHeartRateVariabilityMetrics(): void {
    if (this.rrIntervals.length < 4) {
      return;
    }
    
    // Calcular RMSSD: Root Mean Square of Successive Differences
    let sumSquaredDiff = 0;
    let successiveDiffsCount = 0;
    let nnxCount = 0; // Contador para intervalos que difieren más de 50ms
    
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiff += diff * diff;
      successiveDiffsCount++;
      
      // Contar intervalos que difieren en más de 50ms
      if (Math.abs(diff) > 50) {
        nnxCount++;
      }
    }
    
    // Actualizar métricas
    this.rmssd = Math.sqrt(sumSquaredDiff / successiveDiffsCount);
    this.pnnx = successiveDiffsCount > 0 ? (nnxCount / successiveDiffsCount) * 100 : 0;
    
    // Calcular variación RR con respecto a la línea base
    if (this.baselineRR > 0 && this.rrIntervals.length > 0) {
      const lastInterval = this.rrIntervals[0];
      this.rrVariation = Math.abs(lastInterval - this.baselineRR) / this.baselineRR;
    }
    
    // Calcular aproximación de entropía muestral (simplificada)
    // Esta métrica mide la complejidad/irregularidad de los intervalos RR
    if (this.rrIntervals.length >= 10) {
      this.calculateApproximateEntropy();
    }
  }
  
  /**
   * Calcula una aproximación de la entropía de la señal (complejidad)
   * Mayor entropía = mayor irregularidad = mayor probabilidad de arritmia
   */
  private calculateApproximateEntropy(): void {
    const m = 2; // Longitud de subsecuencia
    const r = 0.2; // Tolerancia
    
    // Implementación simplificada para aproximar entropía
    // Sin ser computacionalmente intensiva
    let patterns = 0;
    let totalComparisons = 0;
    
    for (let i = 0; i < this.rrIntervals.length - m; i++) {
      for (let j = i + 1; j < this.rrIntervals.length - m + 1; j++) {
        let matches = 0;
        for (let k = 0; k < m; k++) {
          if (Math.abs(this.rrIntervals[i+k] - this.rrIntervals[j+k]) <= r * this.baselineRR) {
            matches++;
          }
        }
        if (matches === m) {
          patterns++;
        }
        totalComparisons++;
      }
    }
    
    // Evitar división por cero
    if (totalComparisons > 0) {
      // Aproximación simplificada de entropía
      this.entropy = -Math.log(patterns / totalComparisons);
    }
  }

  /**
   * Método principal que detecta y clasifica arritmias
   * Retorna estado completo de la detección
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Verificar condiciones mínimas para detección
    if (this.rrIntervals.length < this.MIN_ANALYSIS_SET || 
        this.amplitudes.length < this.MIN_ANALYSIS_SET || 
        this.peakSequence.length < 3) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Si estamos en fase de aprendizaje, no detectar arritmias todavía
    if (this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `CALIBRANDO|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Verificar si se ha detectado una arritmia reciente
    const hasRecentArrhythmia = 
      this.recognizedPatterns.length > 0 && 
      currentTime - this.recognizedPatterns[this.recognizedPatterns.length - 1].timestamp < 1000;
      
    // Verificar si los valores de variabilidad indican anomalía
    const highVariabilityDetected = 
      this.rmssd > this.RMSSD_THRESHOLD * this.DETECTION_SENSITIVITY && 
      this.pnnx > 20 * this.DETECTION_SENSITIVITY && 
      this.rrVariation > this.RR_VARIATION_THRESHOLD * this.DETECTION_SENSITIVITY;
    
    // La detección se basa en patrones reconocidos o alta variabilidad
    const prematureBeatDetected = hasRecentArrhythmia || highVariabilityDetected;
    
    // Datos para análisis detallado
    const detectionData = {
      rmssd: this.rmssd,
      rrVariation: this.rrVariation,
      prematureBeat: prematureBeatDetected,
      pnnx: this.pnnx,
      entropy: this.entropy,
      patterns: this.recognizedPatterns.length,
      confidence: this.lastDetectionConfidence
    };
    
    if (this.DEBUG_MODE && (hasRecentArrhythmia || highVariabilityDetected)) {
      console.log('ArrhythmiaDetector - Estado de detección:', {
        ...detectionData,
        hasRecentArrhythmia,
        highVariabilityDetected,
        count: this.arrhythmiaCount,
        timestamp: new Date(currentTime).toISOString()
      });
    }

    return {
      detected: prematureBeatDetected,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd: this.rmssd, 
        rrVariation: this.rrVariation, 
        prematureBeat: prematureBeatDetected 
      }
    };
  }

  /**
   * Devuelve el estado actual de la detección de arritmias
   */
  getStatus(): string {
    return this.hasDetectedFirstArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Devuelve el contador actual de arritmias
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Limpieza de memoria para gestión de recursos
   */
  cleanMemory(): void {
    this.reset();
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.peakSequence = [];
    this.recognizedPatterns = [];
    
    // Forzar garbage collection
    try {
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    } catch (e) {
      console.log("ArrhythmiaDetector: GC no disponible");
    }
    
    console.log("ArrhythmiaDetector: Limpieza de memoria completada");
  }
}
