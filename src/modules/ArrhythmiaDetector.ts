/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias simplificado para la aplicación CharsHealt
 * Especializado en la detección precisa de latidos prematuros (extrasístoles)
 */

export class ArrhythmiaDetector {
  // ────── PARÁMETROS OPTIMIZADOS PARA DETECCIÓN DE LATIDOS PREMATUROS ──────
  
  // Umbral para detectar intervalo RR prematuro (como % del intervalo normal)
  private readonly PREMATURE_RR_THRESHOLD = 0.85;  // Un latido prematuro ocurre antes del 85% del intervalo normal
  
  // Umbral para detectar amplitud reducida (característica de latidos prematuros)
  private readonly PREMATURE_AMPLITUDE_THRESHOLD = 0.80;  // Amplitud menor al 80% de lo normal es sospechosa
  
  // Fase de aprendizaje - 3 segundos
  private readonly LEARNING_PERIOD_MS = 3000;
  
  // Mínima confianza para contar una arritmia
  private readonly MIN_CONFIDENCE = 0.70;
  
  // Tiempo mínimo entre detecciones para evitar falsos positivos (500ms)
  private readonly MIN_DETECTION_SPACING_MS = 500;
  
  // ────── VARIABLES DE ESTADO ──────
  private rrIntervals: number[] = [];
  private amplitudes: number[] = [];
  private peakTimes: number[] = [];
  private avgNormalRR: number = 0;
  private avgNormalAmplitude: number = 0;
  private lastArrhythmiaTime: number = 0;
  private arrhythmiaCount: number = 0;
  private startTime: number = Date.now();
  private lastPeakTime: number | null = null;
  private hasDetectedFirstArrhythmia: boolean = false;
  
  // Contador para estabilidad de detección
  private consecutiveNormalBeats: number = 0;
  
  // Debug para diagnóstico (activado)
  private readonly DEBUG_MODE = true;

  /**
   * Resetea todas las variables de estado
   */
  reset(): void {
    this.rrIntervals = [];
    this.amplitudes = [];
    this.peakTimes = [];
    this.avgNormalRR = 0;
    this.avgNormalAmplitude = 0;
    this.lastArrhythmiaTime = 0;
    this.arrhythmiaCount = 0;
    this.startTime = Date.now();
    this.lastPeakTime = null;
    this.hasDetectedFirstArrhythmia = false;
    this.consecutiveNormalBeats = 0;
    
    if (this.DEBUG_MODE) {
      console.log("ArrhythmiaDetector: Reset completo");
    }
  }

  /**
   * Verifica si el detector está en fase de aprendizaje
   */
  isInLearningPhase(): boolean {
    return Date.now() - this.startTime < this.LEARNING_PERIOD_MS;
  }

  /**
   * Actualiza los intervalos RR y amplitudes con nuevos datos
   */
  updateIntervals(intervals: number[], lastPeakTime: number | null, peakAmplitude?: number): void {
    if (!intervals || intervals.length === 0) return;
    
    // Actualizar hora del último pico
    this.lastPeakTime = lastPeakTime;
    
    // Solo procesar un intervalo a la vez (el más reciente)
    const lastRR = intervals[intervals.length - 1];
    if (lastRR > 0) {
      this.rrIntervals.push(lastRR);
      
      // Limitar tamaño del historial
      if (this.rrIntervals.length > 20) {
        this.rrIntervals.shift();
      }
    }
    
    // Procesar amplitud si está disponible
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      this.amplitudes.push(peakAmplitude);
      
      // Limitar tamaño del historial
      if (this.amplitudes.length > 20) {
        this.amplitudes.shift();
      }
    }
    
    // Registrar tiempo del pico
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      
      // Limitar tamaño del historial
      if (this.peakTimes.length > 20) {
        this.peakTimes.shift();
      }
    }
    
    // Actualizar valores de referencia si estamos fuera de la fase de aprendizaje
    if (!this.isInLearningPhase()) {
      this.updateReferenceValues();
    }
  }
  
  /**
   * Actualiza los valores de referencia para la detección
   */
  private updateReferenceValues(): void {
    // Necesitamos al menos 3 intervalos para calcular referencias confiables
    if (this.rrIntervals.length < 3) return;
    
    // Ordenar intervalos para filtrar outliers
    const sortedRRs = [...this.rrIntervals].sort((a, b) => a - b);
    
    // Eliminar el 20% superior e inferior para obtener valores normales
    const startIdx = Math.floor(sortedRRs.length * 0.2);
    const endIdx = Math.ceil(sortedRRs.length * 0.8);
    const normalRRs = sortedRRs.slice(startIdx, endIdx);
    
    // Calcular promedio de intervalos normales
    if (normalRRs.length > 0) {
      const sum = normalRRs.reduce((acc, val) => acc + val, 0);
      const newAvgRR = sum / normalRRs.length;
      
      // Actualizar gradualmente (para evitar cambios bruscos)
      if (this.avgNormalRR === 0) {
        this.avgNormalRR = newAvgRR;
      } else {
        this.avgNormalRR = this.avgNormalRR * 0.8 + newAvgRR * 0.2;
      }
    }
    
    // Repetir para amplitudes (si hay disponibles)
    if (this.amplitudes.length >= 3) {
      const sortedAmps = [...this.amplitudes].sort((a, b) => b - a);  // Orden descendente
      
      // Usar el tercio superior para amplitude de referencia normal (los latidos normales suelen ser más fuertes)
      const normalCount = Math.max(1, Math.floor(sortedAmps.length / 3));
      const normalAmps = sortedAmps.slice(0, normalCount);
      
      if (normalAmps.length > 0) {
        const ampSum = normalAmps.reduce((acc, val) => acc + val, 0);
        const newAvgAmp = ampSum / normalAmps.length;
        
        // Actualizar gradualmente
        if (this.avgNormalAmplitude === 0) {
          this.avgNormalAmplitude = newAvgAmp;
        } else {
          this.avgNormalAmplitude = this.avgNormalAmplitude * 0.8 + newAvgAmp * 0.2;
        }
      }
    }
  }

  /**
   * Detecta latidos prematuros basados en intervalos RR e información de amplitud
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean; confidence?: number } | null;
  } {
    // No detectar durante fase de aprendizaje o si no hay suficientes datos
    if (this.isInLearningPhase() || 
        this.rrIntervals.length < 3 || 
        this.avgNormalRR === 0) {
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
    let prematureBeatDetected = false;
    let detectionConfidence = 0.0;
    
    // Algoritmo simplificado: solo detecta latidos prematuros
    // Un latido prematuro tiene:
    // 1. Intervalo RR más corto de lo normal
    // 2. Amplitud más baja (opcional, si hay datos de amplitud)
    
    // Verificar solo el intervalo más reciente
    if (this.rrIntervals.length > 0) {
      const lastRR = this.rrIntervals[this.rrIntervals.length - 1];
      
      // Calcular cuánto se desvía del promedio normal (ratio)
      // Un valor bajo indica un latido que llegó antes de lo esperado
      const rrRatio = lastRR / this.avgNormalRR;
      
      // Si el intervalo es significativamente más corto
      if (rrRatio < this.PREMATURE_RR_THRESHOLD) {
        // Verificar si hay datos de amplitud
        if (this.amplitudes.length > 0 && this.avgNormalAmplitude > 0) {
          const lastAmp = this.amplitudes[this.amplitudes.length - 1];
          const ampRatio = lastAmp / this.avgNormalAmplitude;
          
          // Latido prematuro clásico: intervalo corto + amplitud reducida
          if (ampRatio < this.PREMATURE_AMPLITUDE_THRESHOLD) {
            prematureBeatDetected = true;
            
            // Calcular confianza (cuanto más prematura y menor amplitud, mayor confianza)
            const rrConfidence = 1.0 - (rrRatio / this.PREMATURE_RR_THRESHOLD);
            const ampConfidence = 1.0 - (ampRatio / this.PREMATURE_AMPLITUDE_THRESHOLD);
            detectionConfidence = (rrConfidence * 0.7) + (ampConfidence * 0.3);
            
            if (this.DEBUG_MODE) {
              console.log("ArrhythmiaDetector: Latido prematuro detectado", {
                rrRatio,
                ampRatio,
                confianza: detectionConfidence,
                umbralRR: this.PREMATURE_RR_THRESHOLD,
                umbralAmp: this.PREMATURE_AMPLITUDE_THRESHOLD
              });
            }
          } else {
            // Solo intervalo corto, pero amplitud normal (menos confianza)
            prematureBeatDetected = true;
            detectionConfidence = Math.max(0.7, 1.0 - (rrRatio / this.PREMATURE_RR_THRESHOLD) * 0.8);
            
            if (this.DEBUG_MODE) {
              console.log("ArrhythmiaDetector: Latido prematuro por intervalo detectado", {
                rrRatio,
                confianza: detectionConfidence
              });
            }
          }
        } else {
          // No hay datos de amplitud pero el intervalo es claramente prematuro
          prematureBeatDetected = true;
          detectionConfidence = Math.max(0.7, 1.0 - (rrRatio / this.PREMATURE_RR_THRESHOLD) * 0.9);
          
          if (this.DEBUG_MODE) {
            console.log("ArrhythmiaDetector: Latido prematuro detectado (sin datos de amplitud)", {
              rrRatio,
              confianza: detectionConfidence
            });
          }
        }
      } else {
        // Latido normal
        this.consecutiveNormalBeats++;
      }
    }
    
    // Ajustar confianza si no hay una secuencia de latidos normales previa
    if (prematureBeatDetected && this.consecutiveNormalBeats < 2) {
      detectionConfidence *= 0.7;  // Reducir confianza si no había estabilidad previa
    }
    
    // RMSSD para métrica estándar de variabilidad
    let rmssd = 0;
    if (this.rrIntervals.length >= 2) {
      let sumSquaredDiff = 0;
      for (let i = 1; i < this.rrIntervals.length; i++) {
        const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
        sumSquaredDiff += diff * diff;
      }
      rmssd = Math.sqrt(sumSquaredDiff / (this.rrIntervals.length - 1));
    }
    
    // Calcular variación del último intervalo respecto al normal
    const rrVariation = this.rrIntervals.length > 0 ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.avgNormalRR) / this.avgNormalRR : 
      0;
    
    // Contabilizar arritmia solo si:
    // 1. Se detectó un latido prematuro con suficiente confianza
    // 2. Ha pasado suficiente tiempo desde la última detección
    if (prematureBeatDetected && 
        detectionConfidence >= this.MIN_CONFIDENCE &&
        currentTime - this.lastArrhythmiaTime > this.MIN_DETECTION_SPACING_MS) {
      
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      this.consecutiveNormalBeats = 0;
      
      if (this.DEBUG_MODE) {
        console.log("ArrhythmiaDetector: ¡ARRITMIA CONTABILIZADA!", {
          contador: this.arrhythmiaCount,
          tiempo: new Date(currentTime).toLocaleTimeString(),
          confianza: detectionConfidence
        });
      }
    }
    
    return {
      detected: prematureBeatDetected && detectionConfidence >= this.MIN_CONFIDENCE,
      count: this.arrhythmiaCount,
      status: this.hasDetectedFirstArrhythmia ? 
        `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
        `SIN ARRITMIAS|${this.arrhythmiaCount}`,
      data: { 
        rmssd, 
        rrVariation, 
        prematureBeat: prematureBeatDetected,
        confidence: detectionConfidence
      }
    };
  }

  /**
   * Obtener el estado actual de la detección de arritmias
   */
  getStatus(): string {
    return this.hasDetectedFirstArrhythmia ? 
      `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
      `SIN ARRITMIAS|${this.arrhythmiaCount}`;
  }

  /**
   * Obtener el contador actual de arritmias
   */
  getCount(): number {
    return this.arrhythmiaCount;
  }
  
  /**
   * Limpiar memoria para gestión de recursos
   */
  cleanMemory(): void {
    this.reset();
  }
}
