export class ArrhythmiaDetector {
  // Identificador de versión para diagnosticar problemas de duplicación
  private static readonly VERSION = "2.1.3"; // Identificador específico para esta versión
  private readonly ALGORITHM_ID = "STRICT_PREMATURE_DETECTOR_V213";
  
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 5;
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 2000; // Reducido para detectar antes
  
  // MÁS ESTRICTO: Ajustes extremos para solo detectar latidos prematuros entre normales
  private readonly PREMATURE_BEAT_THRESHOLD = 0.65; // Más estricto para evitar falsos positivos
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.53; // Umbral MUCHO más bajo - solo picos muy pequeños
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.85; // Umbral para considerar un pico como normal
  
  // NUEVA PROTECCIÓN: Prevenir detecciones múltiples consecutivas
  private readonly COOLDOWN_AFTER_DETECTION_MS = 1500; // Período de enfriamiento post-arritmia
  private readonly MIN_NORMAL_BEATS_BETWEEN_PREMATURE = 2; // Mínimo de latidos normales entre prematuros
  
  // NUEVO: Evitar comportamiento errático entre sesiones
  private readonly MAX_INACTIVE_TIME_MS = 5000; // Tiempo máximo sin actualizaciones antes de reiniciar 
  private readonly MAX_PEAKS_WITHOUT_DETECTION = 50; // Reiniciar si no hay detecciones después de muchos picos
  private lastUpdateTime = Date.now();
  private peaksProcessedSinceLastDetection = 0; 
  
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
  
  // NUEVO: Variables para evitar falsas detecciones continuas
  private normalBeatsAfterPremature: number = 0;
  private lastPrematureIndex: number = -1;
  private inPostArrhythmiaCooldown: boolean = false;
  
  // NUEVO: Flag para verificar si la instancia está inicializada correctamente
  private isProperlyInitialized: boolean = true;
  
  // NUEVO: Almacenamiento de secuencia de picos para análisis preciso
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
    index: number; // Añadido para rastrear picos secuencialmente
  }> = [];
  
  // DEBUG flag to track detection issues
  private readonly DEBUG_MODE = true;
  
  constructor() {
    this.logInitialization();
    this.reset();
  }

  /**
   * NUEVO: Registrar información de inicialización para diagnóstico
   */
  private logInitialization(): void {
    console.log(`ArrhythmiaDetector: Inicialización v${ArrhythmiaDetector.VERSION} (${this.ALGORITHM_ID})`);
    console.log(`ArrhythmiaDetector: Thresholds - Normal: ${this.NORMAL_PEAK_MIN_THRESHOLD}, Premature: ${this.AMPLITUDE_RATIO_THRESHOLD}`);
  }
  
  /**
   * NUEVO: Verifica si debe reiniciar por inactividad o falta de detecciones
   */
  private checkForAutoReset(): void {
    const now = Date.now();
    
    // Reiniciar si han pasado demasiado tiempo sin actualizaciones (posible inactividad)
    if (now - this.lastUpdateTime > this.MAX_INACTIVE_TIME_MS) {
      console.log(`ArrhythmiaDetector: Auto-reset por inactividad (${Math.round((now - this.lastUpdateTime)/1000)}s)`);
      this.reset();
      return;
    }
    
    // Reiniciar si procesamos demasiados picos sin detectar arritmias (posible fallo)
    if (this.peaksProcessedSinceLastDetection > this.MAX_PEAKS_WITHOUT_DETECTION && 
        this.hasDetectedFirstArrhythmia && 
        now - this.lastArrhythmiaTime > 30000) {
      console.log(`ArrhythmiaDetector: Auto-reset por falta de detecciones (${this.peaksProcessedSinceLastDetection} picos)`);
      this.reset();
      return;
    }
  }
  
  /**
   * Reset all state variables
   */
  reset(): void {
    // Guardar la hora de inicio para referencia
    const startTime = Date.now();
    
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.isLearningPhase = true;
    this.hasDetectedFirstArrhythmia = false;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = startTime;
    this.lastRMSSD = 0;
    this.lastRRVariation = 0;
    this.lastArrhythmiaTime = 0;
    this.lastPeakTime = null;
    this.avgNormalAmplitude = 0;
    this.baseRRInterval = 0;
    this.peakSequence = [];
    
    // Reinicio de variables de protección
    this.normalBeatsAfterPremature = 0;
    this.lastPrematureIndex = -1;
    this.inPostArrhythmiaCooldown = false;
    
    // Reinicio de variables de auto-diagnóstico
    this.lastUpdateTime = startTime;
    this.peaksProcessedSinceLastDetection = 0;
    this.isProperlyInitialized = true;
    
    console.log(`ArrhythmiaDetector: Reset completo (v${ArrhythmiaDetector.VERSION})`);
  }
  
  /**
   * NUEVO: Verificar si la instancia está en un estado válido
   */
  private ensureValidState(): boolean {
    // Verificaciones de estado interno
    // Reinicio automático si algo no está bien
    if (!this.isProperlyInitialized) {
      console.warn("ArrhythmiaDetector: Estado inválido detectado, reiniciando");
      this.reset();
      return false;
    }
    
    // Verificar consistencia en las estructuras de datos
    const peakSeqLength = this.peakSequence.length;
    const amplitudesLength = this.amplitudes.length;
    
    // Si hay una discrepancia severa entre estructuras, reiniciar
    if ((peakSeqLength > 0 && amplitudesLength === 0) || 
        (amplitudesLength > 0 && peakSeqLength === 0 && !this.isLearningPhase)) {
      console.warn("ArrhythmiaDetector: Inconsistencia en estructuras de datos, reiniciando");
      this.reset();
      return false;
    }
    
    // Verificar si alguna estructura tiene valores pero otras no
    if ((this.avgNormalAmplitude > 0 && amplitudesLength === 0) ||
        (this.baseRRInterval > 0 && this.rrIntervals.length === 0)) {
      console.warn("ArrhythmiaDetector: Inconsistencia en parámetros de referencia, reiniciando");
      this.reset();
      return false;
    }
    
    return true;
  }

  /**
   * Check if in learning phase
   */
  isInLearningPhase(): boolean {
    // Asegurar estado válido antes de responder
    if (!this.ensureValidState()) {
      return true; // Si no es válido, volver a fase de aprendizaje
    }
    
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
            algorithm: this.ALGORITHM_ID,
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
          
          console.log('ArrhythmiaDetector - Intervalo RR normal:', {
            algorithm: this.ALGORITHM_ID,
            baseRRInterval: this.baseRRInterval,
            totalSamples: this.rrIntervals.length
          });
        }
      }
    }
  }

  /**
   * Update RR intervals and peak amplitudes with new data
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    // NUEVO: Verificar si es necesario un autoreset antes de procesar
    this.checkForAutoReset();
    
    // Asegurar que la instancia está en un estado válido
    if (!this.ensureValidState()) {
      return; // Si detectamos un estado inválido, no procesamos más hasta el siguiente ciclo
    }
    
    // Check if we have any data to process
    if (!intervals || intervals.length === 0) {
      return;
    }

    const currentTime = Date.now();
    this.lastUpdateTime = currentTime; // NUEVO: Actualizar timestamp de última actualización
    
    this.rrIntervals = intervals;
    this.lastPeakTime = lastPeakTime;
    
    // Incrementar contador de picos procesados desde la última detección
    this.peaksProcessedSinceLastDetection++;
    
    // NUEVO: Verificar si debemos salir del período de enfriamiento
    if (this.inPostArrhythmiaCooldown && currentTime - this.lastArrhythmiaTime > this.COOLDOWN_AFTER_DETECTION_MS) {
      this.inPostArrhythmiaCooldown = false;
      console.log(`ArrhythmiaDetector - Finalizado período de enfriamiento post-arritmia (${this.ALGORITHM_ID})`);
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
          
          // MEJORADO: Clasificación más robusta de tipos de latidos
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            peakType = 'normal';
            
            // NUEVO: Contador de latidos normales después de uno prematuro
            if (this.lastPrematureIndex >= 0) {
              this.normalBeatsAfterPremature++;
            }
          } 
          // Clasificar como prematuro solo si no estamos en período de enfriamiento
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD && !this.inPostArrhythmiaCooldown) {
            peakType = 'premature';
            
            // Verificar si tenemos suficientes latidos normales desde el último prematuro
            if (this.normalBeatsAfterPremature < this.MIN_NORMAL_BEATS_BETWEEN_PREMATURE && 
                this.lastPrematureIndex >= 0) {
              
              // Si no hay suficientes latidos normales, lo clasificamos como "desconocido"
              // para evitar falsas detecciones consecutivas
              console.log(`ArrhythmiaDetector - Reclasificando latido: de prematuro a desconocido (${this.ALGORITHM_ID})`);
              peakType = 'unknown';
            } else {
              // Actualizar índice del último latido prematuro
              this.lastPrematureIndex = this.peakSequence.length;
              this.normalBeatsAfterPremature = 0;
            }
          }
        }
        
        // Crear nuevo objeto de pico con índice secuencial
        const newPeak = {
          amplitude: Math.abs(peakAmplitude),
          time: currentTime,
          type: peakType,
          index: this.peakSequence.length
        };
        
        this.peakSequence.push(newPeak);
        
        // Mantener solo los últimos 10 picos
        if (this.peakSequence.length > 10) {
          this.peakSequence.shift();
          
          // Ajustar índices después de eliminar el primer elemento
          this.peakSequence.forEach((peak, i) => {
            peak.index = i;
          });
          
          // Ajustar lastPrematureIndex si es necesario
          if (this.lastPrematureIndex > 0) {
            this.lastPrematureIndex--;
          } else if (this.lastPrematureIndex === 0) {
            this.lastPrematureIndex = -1; // Ya no tenemos el latido prematuro en el buffer
          }
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
   * Con protección adicional contra falsas detecciones consecutivas
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // NUEVO: Verificar estado válido antes de procesar
    if (!this.ensureValidState()) {
      return {
        detected: false,
        count: 0,
        status: "VERIFICANDO SEÑAL",
        data: null
      };
    }
    
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
    
    // ALGORITMO SIMPLIFICADO Y ESPECÍFICO:
    // 1. Solo trabajamos con la secuencia de picos (amplitudes y tiempos)
    // 2. Buscamos un patrón específico: NORMAL - PEQUEÑO - NORMAL
    
    let prematureBeatDetected = false;
    
    // NUEVO: Si estamos en período de enfriamiento, no detectamos nuevas arritmias
    if (this.inPostArrhythmiaCooldown) {
      // Calcular variación RR para información adicional pero no detectamos nada
      const rrVariation = (this.rrIntervals.length > 1) ? 
        Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
        0;
      this.lastRRVariation = rrVariation;
      
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: { rmssd, rrVariation, prematureBeat: false }
      };
    }
    
    // ALGORITMO ESTRICTO: Buscar el patrón específico de latido prematuro entre normales
    if (this.peakSequence.length >= 3 && this.avgNormalAmplitude > 0) {
      // Verificamos los 3 últimos picos 
      const lastThreePeaks = this.peakSequence.slice(-3);
      
      // NUEVO: Verificar secuencia más estrictamente - Queremos que el último pico sea el normal
      // para asegurar el patrón completo NORMAL-PREMATURO-NORMAL
      const pattern = {
        firstNormal: lastThreePeaks[0].type === 'normal',
        middlePremature: lastThreePeaks[1].type === 'premature',
        lastNormal: lastThreePeaks[2].type === 'normal'
      };
      
      // Solo procesamos si el último pico es normal (completando el patrón)
      if (pattern.lastNormal) {
        // Verificar el patrón completo
        if (pattern.firstNormal && pattern.middlePremature) {
          // Para más seguridad, verificar que las amplitudes relativas cumplan lo esperado
          const firstPeakRatio = lastThreePeaks[0].amplitude / this.avgNormalAmplitude;
          const secondPeakRatio = lastThreePeaks[1].amplitude / this.avgNormalAmplitude;
          const thirdPeakRatio = lastThreePeaks[2].amplitude / this.avgNormalAmplitude;
          
          if (secondPeakRatio <= this.AMPLITUDE_RATIO_THRESHOLD && 
              firstPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD && 
              thirdPeakRatio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            
            // NUEVO: Verificación temporal - asegurar que los tres picos estén dentro de un rango de tiempo razonable
            const timeSpan = lastThreePeaks[2].time - lastThreePeaks[0].time;
            
            // El tiempo total debe ser menor a 2 segundos para un patrón válido de arritmia
            // (esto es aproximadamente 2-3 latidos a frecuencia cardíaca normal)
            if (timeSpan < 2000) {
              prematureBeatDetected = true;
              
              console.log(`ArrhythmiaDetector - ¡LATIDO PREMATURO DETECTADO! (${this.ALGORITHM_ID}):`, {
                prematuroRatio: secondPeakRatio,
                normal1Ratio: firstPeakRatio,
                normal2Ratio: thirdPeakRatio,
                timeSpan: timeSpan,
                umbralPequeno: this.AMPLITUDE_RATIO_THRESHOLD,
                umbralNormal: this.NORMAL_PEAK_MIN_THRESHOLD
              });
            } else {
              console.log(`ArrhythmiaDetector - Patrón rechazado por tiempo excesivo (${this.ALGORITHM_ID}):`, {
                timeSpan: timeSpan
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
    this.lastRRVariation = rrVariation;
    
    // Solo contar arritmias si suficiente tiempo desde la última (500ms) para evitar duplicados
    if (prematureBeatDetected && currentTime - this.lastArrhythmiaTime > 500) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      // Resetear contador de picos sin detección
      this.peaksProcessedSinceLastDetection = 0;
      
      // NUEVO: Activar período de enfriamiento después de una detección
      this.inPostArrhythmiaCooldown = true;
      
      if (this.DEBUG_MODE) {
        console.log(`ArrhythmiaDetector - NUEVA ARRITMIA CONTABILIZADA (${this.ALGORITHM_ID}):`, {
          version: ArrhythmiaDetector.VERSION,
          count: this.arrhythmiaCount,
          timestamp: currentTime,
          cooldownActivado: this.inPostArrhythmiaCooldown,
          amplitudes: this.amplitudes.slice(-5),
          peakSequence: this.peakSequence.slice(-5).map(p => ({
            type: p.type,
            ratio: p.amplitude / this.avgNormalAmplitude,
            index: p.index
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
    if (!this.ensureValidState()) {
      return "VERIFICANDO SEÑAL";
    }
    
    return this.hasDetectedFirstArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Get current arrhythmia count
   */
  getCount(): number {
    if (!this.ensureValidState()) {
      return 0;
    }
    
    return this.arrhythmiaCount;
  }
  
  /**
   * Get algorithm identification 
   */
  getAlgorithmInfo(): string {
    return `${this.ALGORITHM_ID} v${ArrhythmiaDetector.VERSION}`;
  }
  
  /**
   * Perform deep memory cleanup
   */
  cleanMemory(): void {
    this.reset();
    // Limpieza adicional de estructuras...
  }
}
