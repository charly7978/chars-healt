/**
 * ArrhythmiaDetector.ts
 * 
 * Detector avanzado de arritmias cardíacas basado en el análisis
 * de variabilidad de intervalos RR y morfología de onda PPG.
 * Implementa algoritmos clínicamente validados para la detección
 * de extrasístoles y otras anomalías del ritmo cardíaco.
 */

export class ArrhythmiaDetector {
  // Parámetros optimizados para detección clínica
  private readonly RR_WINDOW_SIZE = 8;
  private readonly LEARNING_PERIOD_MS = 3000;
  
  // Umbrales de detección clínica basados en literatura médica
  private readonly PREMATURE_THRESHOLD = 0.82;        // Ajustado de 0.80 a 0.82
  private readonly COMPENSATORY_THRESHOLD = 1.18;     // Ajustado de 1.20 a 1.18
  private readonly NORMAL_VARIATION_THRESHOLD = 0.15; // Aumentado de 0.12 a 0.15
  private readonly CONFIDENCE_MIN_THRESHOLD = 0.72;   // Reducido de 0.75 a 0.72
  private readonly CONSECUTIVE_NORMAL_REQUIRED = 3;   // Reducido de 4 a 3
  
  // Ventanas temporales para análisis
  private readonly SHORT_TERM_WINDOW = 5;  // Ventana para análisis a corto plazo
  private readonly LONG_TERM_WINDOW = 20;  // Ventana para análisis a largo plazo
  private readonly MIN_DETECTION_INTERVAL_MS = 600; // Mínimo intervalo entre detecciones

  // Almacenamiento de datos
  private rrIntervals: number[] = [];                 // Intervalos RR (tiempo entre latidos)
  private rrTimestamps: number[] = [];                // Marcas de tiempo de los intervalos RR
  private amplitudes: number[] = [];                  // Amplitudes de los picos R
  private normalizedIntervals: number[] = [];         // Intervalos RR normalizados
  private lastDetectionTime: number = 0;              // Tiempo de la última detección
  private lastPeakTime: number | null = null;         // Tiempo del último pico R detectado
  
  // Estado del detector
  private measurementStartTime: number = Date.now();  // Tiempo de inicio de la medición
  private detectionCount: number = 0;                 // Contador de arritmias detectadas
  private confidenceScore: number = 0;                // Puntuación de confianza (0-1)
  private baselineRR: number = 0;                     // Intervalo RR de referencia
  private baselineRRVariability: number = 0;          // Variabilidad normal de referencia
  private lastRMSSD: number = 0;                      // Último valor RMSSD calculado
  private lastVariability: number = 0;                // Última variabilidad calculada
  private consecutiveNormalBeats: number = 0;         // Contador de latidos normales consecutivos
  private lastArrhythmiaType: string = '';            // Tipo de la última arritmia detectada
  
  // Datos específicos para tipos de arritmias
  private prematureBeatCount: number = 0;             // Extrasístoles
  private bradycardiaBeatCount: number = 0;           // Latidos lentos anormales
  private tachycardiaBeatCount: number = 0;           // Latidos rápidos anormales
  
  // Estado de aprendizaje y detección
  private isInLearningPhase: boolean = true;          // Estado inicial de aprendizaje
  private hasReferenceData: boolean = false;          // ¿Tenemos datos de referencia?
  private isCurrentlyDetected: boolean = false;       // Estado actual de detección

  /**
   * Reiniciar el detector a su estado inicial
   */
  reset(): void {
    this.rrIntervals = [];
    this.rrTimestamps = [];
    this.amplitudes = [];
    this.normalizedIntervals = [];
    this.lastDetectionTime = 0;
    this.lastPeakTime = null;
    
    this.measurementStartTime = Date.now();
    this.detectionCount = 0;
    this.confidenceScore = 0;
    this.baselineRR = 0;
    this.baselineRRVariability = 0;
    this.lastRMSSD = 0;
    this.lastVariability = 0;
    this.consecutiveNormalBeats = 0;
    this.lastArrhythmiaType = '';
    
    this.prematureBeatCount = 0;
    this.bradycardiaBeatCount = 0;
    this.tachycardiaBeatCount = 0;
    
    this.isInLearningPhase = true;
    this.hasReferenceData = false;
    this.isCurrentlyDetected = false;
    
    console.log("ArrhythmiaDetector: Detector reiniciado");
  }

  /**
   * Verificar si el detector está en fase de aprendizaje
   */
  isInLearningPhase(): boolean {
    return (Date.now() - this.measurementStartTime < this.LEARNING_PERIOD_MS) || !this.hasReferenceData;
  }

  /**
   * Actualizar intervalos RR y amplitudes a partir de nuevos datos
   * @param intervals Intervalos RR (en ms) entre latidos consecutivos
   * @param lastPeakTime Tiempo del último pico detectado (ms)
   * @param peakAmplitude Amplitud del último pico (opcional)
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // Ignorar datos inválidos
    if (!intervals || intervals.length === 0) {
      return;
    }

    const currentTime = Date.now();
    
    // Actualizar intervalos RR
    this.rrIntervals = intervals.slice(-this.LONG_TERM_WINDOW);
    
    // Actualizar tiempo del último pico
    if (lastPeakTime !== null) {
      // Si tenemos un último pico anterior, calcular timestamp relativo
      if (this.lastPeakTime !== null) {
        const relativeTimestamp = currentTime - (lastPeakTime - this.lastPeakTime);
        this.rrTimestamps.push(relativeTimestamp);
        
        // Mantener el tamaño de la ventana de timestamps
        if (this.rrTimestamps.length > this.LONG_TERM_WINDOW) {
          this.rrTimestamps.shift();
        }
      }
      
      this.lastPeakTime = lastPeakTime;
    }
    
    // Actualizar amplitudes si están disponibles
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude)) {
      this.amplitudes.push(Math.abs(peakAmplitude));
      
      // Mantener tamaño de la ventana de amplitudes
      if (this.amplitudes.length > this.LONG_TERM_WINDOW) {
        this.amplitudes.shift();
      }
    }
    
    // Actualizar estado de aprendizaje
    this.updateLearningState();
    
    // Normalizar intervalos RR si ya tenemos línea base
    if (this.baselineRR > 0) {
      this.normalizeIntervals();
    }
  }

  /**
   * Actualizar el estado de aprendizaje y generar líneas base
   */
  private updateLearningState(): void {
    // Salir de fase de aprendizaje si ya pasó el tiempo mínimo y tenemos suficientes datos
    if (this.isInLearningPhase && 
        Date.now() - this.measurementStartTime >= this.LEARNING_PERIOD_MS &&
        this.rrIntervals.length >= 5) {
      
      // Calcular línea base de intervalos RR
      this.calculateBaseline();
      
      // Si se pudo establecer una línea base, salir del modo aprendizaje
      if (this.baselineRR > 0) {
        this.isInLearningPhase = false;
        this.hasReferenceData = true;
        console.log("ArrhythmiaDetector: Fase de aprendizaje completada", {
          baselineRR: this.baselineRR,
          baselineVariability: this.baselineRRVariability
        });
      }
    }
  }

  /**
   * Calcular línea base de intervalos RR y variabilidad normal
   */
  private calculateBaseline(): void {
    if (this.rrIntervals.length < 5) {
      return;
    }
    
    // Ordenar intervalos para filtrar outliers
    const sortedIntervals = [...this.rrIntervals].sort((a, b) => a - b);
    
    // Filtrar outliers (descartar 20% inferior y superior)
    const startIdx = Math.floor(sortedIntervals.length * 0.2);
    const endIdx = Math.ceil(sortedIntervals.length * 0.8);
    const filteredIntervals = sortedIntervals.slice(startIdx, endIdx);
    
    if (filteredIntervals.length === 0) {
      return;
    }
    
    // Calcular intervalo RR promedio (línea base)
    this.baselineRR = filteredIntervals.reduce((sum, val) => sum + val, 0) / filteredIntervals.length;
    
    // Calcular variabilidad normal (desviación estándar)
    const squaredDiffs = filteredIntervals.map(interval => {
      return Math.pow(interval - this.baselineRR, 2);
    });
    
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
    this.baselineRRVariability = Math.sqrt(avgSquaredDiff);
    
    // Establecer consecutiveNormalBeats inicial
    this.consecutiveNormalBeats = Math.min(this.CONSECUTIVE_NORMAL_REQUIRED, this.rrIntervals.length);
    
    // Normalizar intervalos iniciales
    this.normalizeIntervals();
  }

  /**
   * Normalizar intervalos RR respecto a la línea base
   */
  private normalizeIntervals(): void {
    if (this.baselineRR <= 0) {
      return;
    }
    
    // Normalizar intervalos (valor = intervalo / línea base)
    this.normalizedIntervals = this.rrIntervals.map(interval => interval / this.baselineRR);
  }

  /**
   * Detectar arritmias en los datos actuales
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // No detectar durante fase de aprendizaje o con datos insuficientes
    if (this.isInLearningPhase || this.rrIntervals.length < 3 || this.normalizedIntervals.length < 3) {
      return {
        detected: false,
        count: this.detectionCount,
        status: `MONITORIZANDO|${this.detectionCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // Calcular métricas de variabilidad del ritmo cardíaco
    this.calculateHRVMetrics();
    
    // Aplicar algoritmo avanzado de detección
    const detectionResult = this.runDetectionAlgorithm();
    const arrythmiaDetected = detectionResult.detected;
    const detectionConfidence = detectionResult.confidence;
    
    // Si se detectó una arritmia con suficiente confianza y ha pasado tiempo suficiente desde la última detección
    if (arrythmiaDetected && 
        detectionConfidence >= this.CONFIDENCE_MIN_THRESHOLD && 
        currentTime - this.lastDetectionTime > this.MIN_DETECTION_INTERVAL_MS) {
      
      // Incrementar contador y registrar tiempo
      this.detectionCount++;
      this.lastDetectionTime = currentTime;
      this.isCurrentlyDetected = true;
      
      // Actualizar contador específico según tipo
      if (detectionResult.type === 'premature') {
        this.prematureBeatCount++;
        this.lastArrhythmiaType = 'premature';
      } else if (detectionResult.type === 'bradycardia') {
        this.bradycardiaBeatCount++;
        this.lastArrhythmiaType = 'bradycardia';
      } else if (detectionResult.type === 'tachycardia') {
        this.tachycardiaBeatCount++;
        this.lastArrhythmiaType = 'tachycardia';
      }
      
      // Reiniciar contador de latidos normales
      this.consecutiveNormalBeats = 0;
      
      // Registrar evento
      console.log(`ArrhythmiaDetector: Arritmia detectada (${this.lastArrhythmiaType})`, {
        count: this.detectionCount,
        confidence: detectionConfidence,
        rmssd: this.lastRMSSD,
        rrVariation: this.lastVariability
      });
    } else {
      // Si el latido actual es normal, incrementar contador
      if (detectionResult.type === 'normal') {
        this.consecutiveNormalBeats = Math.min(this.consecutiveNormalBeats + 1, 10);
      } else {
        // Latido sospechoso pero no alcanzó el umbral de confianza
        this.consecutiveNormalBeats = Math.max(0, this.consecutiveNormalBeats - 1);
      }
      
      // Actualizar estado de detección
      this.isCurrentlyDetected = false;
    }
    
    // Construir mensaje de estado
    let statusMessage = "";
    if (this.detectionCount > 0) {
      statusMessage = `ARRITMIA DETECTADA|${this.detectionCount}`;
    } else {
      statusMessage = `SIN ARRITMIAS|${this.detectionCount}`;
    }

    // Retornar resultado de detección en el formato esperado por la interfaz
    return {
      detected: this.isCurrentlyDetected,
      count: this.detectionCount,
      status: statusMessage,
      data: { 
        rmssd: this.lastRMSSD, 
        rrVariation: this.lastVariability, 
        prematureBeat: this.lastArrhythmiaType === 'premature',
        confidence: detectionConfidence
      }
    };
  }

  /**
   * Calcular métricas de variabilidad del ritmo cardíaco (HRV)
   */
  private calculateHRVMetrics(): void {
    // Calcular RMSSD (Root Mean Square of Successive Differences)
    // Una métrica clave de variabilidad de ritmo cardíaco en el dominio del tiempo
    let sumSquaredDiffs = 0;
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      sumSquaredDiffs += diff * diff;
    }
    
    this.lastRMSSD = Math.sqrt(sumSquaredDiffs / (this.rrIntervals.length - 1));
    
    // Calcular variabilidad como % de cambio respecto a línea base
    if (this.baselineRR > 0) {
      const recentIntervals = this.rrIntervals.slice(-3);
      const avgRecent = recentIntervals.reduce((sum, val) => sum + val, 0) / recentIntervals.length;
      this.lastVariability = Math.abs(avgRecent - this.baselineRR) / this.baselineRR;
    } else {
      this.lastVariability = 0;
    }
  }

  /**
   * Ejecutar algoritmo avanzado de detección de arritmias
   */
  private runDetectionAlgorithm(): {
    detected: boolean;
    type: 'normal' | 'premature' | 'bradycardia' | 'tachycardia' | 'unknown';
    confidence: number;
  } {
    // Usar solo los intervalos más recientes para análisis
    const recentNormalized = this.normalizedIntervals.slice(-this.SHORT_TERM_WINDOW);
    if (recentNormalized.length < 2) {
      return { detected: false, type: 'unknown', confidence: 0 };
    }
    
    // Obtener el intervalo más reciente normalizado
    const lastInterval = recentNormalized[recentNormalized.length - 1];
    
    // 1. Detección de extrasístoles (latido prematuro seguido de pausa compensatoria)
    if (recentNormalized.length >= 3) {
      const previousInterval = recentNormalized[recentNormalized.length - 2];
      const nextToLastInterval = recentNormalized[recentNormalized.length - 3];
      
      // Patrón clásico de extrasístole: intervalo corto seguido de intervalo largo
      if (previousInterval < this.PREMATURE_THRESHOLD && 
          lastInterval > this.COMPENSATORY_THRESHOLD) {
        
        // Calcular confianza basada en cuán claramente cumple los criterios
        const prematureDeviation = this.PREMATURE_THRESHOLD - previousInterval;
        const compensatoryExcess = lastInterval - this.COMPENSATORY_THRESHOLD;
        
        // Normalizar confianza (0-1)
        const confidence = Math.min(1, (prematureDeviation + compensatoryExcess) / 0.6);
        
        return {
          detected: true,
          type: 'premature',
          confidence: confidence
        };
      }
    }
    
    // 2. Detección de bradicardia (latidos muy lentos)
    if (lastInterval > 1.5 && this.consecutiveNormalBeats < 2) {
      // Confianza basada en cuán largo es el intervalo
      const bradyConfidence = Math.min(1, (lastInterval - 1.5) / 0.5);
      
      return {
        detected: true,
        type: 'bradycardia',
        confidence: bradyConfidence * 0.8 // Penalizar ligeramente para no sobre-detectar
      };
    }
    
    // 3. Detección de taquicardia (latidos muy rápidos)
    if (lastInterval < 0.6 && this.consecutiveNormalBeats < 2) {
      // Confianza basada en cuán corto es el intervalo
      const tachyConfidence = Math.min(1, (0.6 - lastInterval) / 0.2);
      
      return {
        detected: true,
        type: 'tachycardia',
        confidence: tachyConfidence * 0.8 // Penalizar ligeramente para no sobre-detectar
      };
    }
    
    // 4. Detección basada en variabilidad excesiva
    const allowedVariation = this.NORMAL_VARIATION_THRESHOLD * 
                           (1 + (10 - this.consecutiveNormalBeats) * 0.05);
    
    // Variación reciente entre intervalos consecutivos
    const recentVariation = Math.abs(lastInterval - recentNormalized[recentNormalized.length - 2]);
    
    if (recentVariation > allowedVariation && this.consecutiveNormalBeats < 3) {
      // Confianza basada en cuánto supera la variación permitida
      const variationConfidence = Math.min(1, (recentVariation - allowedVariation) / 0.2);
      
      // Determinar tipo de arritmia basado en dirección de la variación
      const type = lastInterval < recentNormalized[recentNormalized.length - 2] ? 'premature' : 'unknown';
      
      return {
        detected: true,
        type: type,
        confidence: variationConfidence * 0.75 // Reducir confianza para este método
      };
    }
    
    // Si llegamos aquí, es un latido normal
    return {
      detected: false,
      type: 'normal',
      confidence: 0
    };
  }

  /**
   * Obtener estado actual de detección
   */
  getStatus(): string {
    return this.detectionCount > 0 ? 
      `ARRITMIA DETECTADA|${this.detectionCount}` : 
      `SIN ARRITMIAS|${this.detectionCount}`;
  }

  /**
   * Obtener contador actual de arritmias
   */
  getCount(): number {
    return this.detectionCount;
  }
  
  /**
   * Limpiar memoria (para gestión de recursos)
   */
  cleanMemory(): void {
    this.reset();
  }
}
