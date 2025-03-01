/**
 * ArrhythmiaDetector.ts
 * 
 * Detector de arritmias avanzado para la aplicación CharsHealt
 * Especializado en la identificación precisa de latidos prematuros (extrasístoles)
 * que aparecen entre dos latidos normales.
 */

export class ArrhythmiaDetector {
  // Constants for arrhythmia detection
  private readonly RR_WINDOW_SIZE = 8; // Aumentado de 5 a 8 para más contexto
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 10000; // Aumentado a 10s para mejor calibración
  
  // OPTIMIZACIÓN DE SENSIBILIDAD: Umbrales refinados para reducir falsos positivos
  private readonly PREMATURE_BEAT_THRESHOLD = 0.58; // Más restrictivo
  private readonly AMPLITUDE_RATIO_THRESHOLD = 0.70; // Más estricto para identificar solo picos realmente pequeños
  private readonly NORMAL_PEAK_MIN_THRESHOLD = 0.75; // Mayor umbral para picos normales
  
  // FACTORES DE CONFIRMACIÓN AVANZADOS
  private readonly MIN_RR_VARIATION_FOR_PREMATURE = 0.28; // Aumentado de 0.20 a 0.28 - Debe ser al menos 28% más corto
  private readonly MAX_PREMATURE_INTERVAL_MS = 7000; // Aumentado para evitar duplicados en detecciones cercanas
  private readonly MIN_NORMAL_BEATS_BEFORE_DETECTION = 8; // Aumentado para requerir mayor estabilidad
  
  // Estado de detección mejorado
  private rrIntervals: number[] = [];
  private amplitudes: number[] = []; // Almacenar amplitudes para detectar picos pequeños
  private peakTimes: number[] = []; // Almacenar tiempos exactos de cada pico
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
  private baseRRInterval: number = 0; // Intervalo RR normal de referencia
  
  // NUEVO: Sistemas avanzados de tracking
  private peakSequence: Array<{
    amplitude: number;
    time: number;
    type: 'normal' | 'premature' | 'unknown';
    rr?: number; // Intervalo RR asociado con este pico
    quality?: number; // Calidad de detección (confianza)
  }> = [];
  
  // NUEVO: Control mejorado de falsos positivos con ventana adaptativa
  private consecNormalBeats: number = 0;
  private recentNormalPeakAmplitudes: number[] = []; // Para cálculo adaptativo
  private readonly AMPLITUDE_HISTORY_SIZE = 10; // Tamaño de historial para cálculo adaptativo
  private falsePositiveStreak: number = 0; // Contador para detectar rachas de falsos positivos
  private readonly MAX_FALSE_POSITIVE_STREAK = 3; // Número máximo permitido
  
  // NUEVO: Sistema de puntuación de confianza para reducir falsos positivos
  private readonly MIN_CONFIDENCE_SCORE = 0.75; // Umbral mínimo de confianza
  private lastConfidenceScores: number[] = [];
  
  // DEBUG flag to track detection issues
  private readonly DEBUG_MODE = false; // Desactivado en producción
  
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
    this.consecNormalBeats = 0;
    this.recentNormalPeakAmplitudes = [];
    this.falsePositiveStreak = 0;
    this.lastConfidenceScores = [];
    
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
        
        // OPTIMIZADO: Cálculo de valores base después de la fase de aprendizaje
        if (this.amplitudes.length > 8) { // Mínimo 8 muestras para calibración confiable
          // Usar mediana ponderada para obtener amplitud normal de referencia
          const sortedAmplitudes = [...this.amplitudes].sort((a, b) => b - a);
          
          // MEJORA: Usar cuartil superior como referencia para la amplitud normal
          const normalCount = Math.max(4, Math.ceil(sortedAmplitudes.length * 0.25));
          const topAmplitudes = sortedAmplitudes.slice(0, normalCount);
          
          // Eliminar valores extremos antes de promediar
          if (topAmplitudes.length > 3) {
            topAmplitudes.shift(); // Eliminar el valor más alto
          }
          
          this.avgNormalAmplitude = topAmplitudes.reduce((a, b) => a + b, 0) / topAmplitudes.length;
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Amplitud normal de referencia CALIBRADA:', {
              avgNormalAmplitude: this.avgNormalAmplitude,
              totalSamples: this.amplitudes.length,
              topValues: topAmplitudes
            });
          }
        }
        
        // OPTIMIZADO: Calcular intervalo RR normal de referencia
        if (this.rrIntervals.length > 8) {
          // Ordenar RR de menor a mayor para análisis estadístico
          const sortedRR = [...this.rrIntervals].sort((a, b) => a - b);
          
          // MEJORA: Eliminar outliers (15% inferior y superior)
          const cutSizePercent = 0.15; // 15% en cada extremo
          const cutSize = Math.max(1, Math.floor(sortedRR.length * cutSizePercent));
          const filteredRR = sortedRR.slice(cutSize, sortedRR.length - cutSize);
          
          // Usar la mediana como referencia de intervalo normal
          const medianIndex = Math.floor(filteredRR.length / 2);
          
          // Si hay suficientes datos, usar la mediana; de lo contrario, usar un promedio recortado
          if (filteredRR.length > 0) {
            this.baseRRInterval = filteredRR[medianIndex];
          } else {
            // Como fallback, usar promedio de todos los intervalos
            this.baseRRInterval = this.rrIntervals.reduce((sum, val) => sum + val, 0) / this.rrIntervals.length;
          }
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Intervalo RR normal CALIBRADO:', {
              baseRRInterval: this.baseRRInterval,
              totalSamples: this.rrIntervals.length,
              medianaRR: filteredRR.length > 0 ? filteredRR[medianIndex] : "N/A",
              filteredSamples: filteredRR.length
            });
          }
        }
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
    
    // OPTIMIZADO: Filtro de intervalos RR mejorado
    if (intervals.length > 0) {
      // MEJORA: Filtrado de intervalos por criterios médicos más precisos
      const validIntervals = intervals.filter(interval => 
        // Latidos entre 35-180 BPM (333-1715ms)
        interval >= 333 && interval <= 1715
      );
      
      if (validIntervals.length > 0) {
        this.rrIntervals = validIntervals;
      }
    }
    
    this.lastPeakTime = lastPeakTime;
    
    // Registrar tiempos de picos
    if (lastPeakTime) {
      this.peakTimes.push(lastPeakTime);
      // Mantener solo los últimos tiempos
      if (this.peakTimes.length > 15) { // Aumentado de 10 a 15
        this.peakTimes.shift();
      }
    }
    
    // OPTIMIZADO: Procesamiento de amplitudes de picos
    if (typeof peakAmplitude === 'number' && !isNaN(peakAmplitude) && peakAmplitude > 0) {
      // Guardar amplitud absoluta para comparaciones más estables
      const absAmplitude = Math.abs(peakAmplitude);
      this.amplitudes.push(absAmplitude);
      
      if (this.amplitudes.length > 20) { // Aumentado de indefinido a 20
        this.amplitudes.shift();
      }
      
      // OPTIMIZADO: Cálculo de intervalos RR entre picos
      let currentRR = 0;
      if (this.peakSequence.length > 0) {
        const lastPeakEntry = this.peakSequence[this.peakSequence.length - 1];
        currentRR = currentTime - lastPeakEntry.time;
      }
      
      // MEJORA: Clasificación de picos más sofisticada
      if (lastPeakTime) {
        // Clasificación inicial como desconocido
        let peakType: 'normal' | 'premature' | 'unknown' = 'unknown';
        let peakQuality = 0.5; // Calidad inicial neutra
        
        // Si ya tenemos amplitud de referencia y no estamos en fase de aprendizaje
        if (this.avgNormalAmplitude > 0 && !this.isLearningPhase) {
          const ratio = absAmplitude / this.avgNormalAmplitude;
          
          // OPTIMIZADO: Clasificación precisa con bandas de confianza
          if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
            peakType = 'normal';
            this.consecNormalBeats++;
            
            // Acumular amplitudes normales para cálculo adaptativo
            this.recentNormalPeakAmplitudes.push(absAmplitude);
            if (this.recentNormalPeakAmplitudes.length > this.AMPLITUDE_HISTORY_SIZE) {
              this.recentNormalPeakAmplitudes.shift();
            }
            
            // Calidad basada en qué tan "normal" es el pico
            peakQuality = Math.min(1.0, ratio / 1.2);
          } 
          // Condición más estricta para latidos prematuros
          else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD && currentRR > 0) {
            // Verificación adicional usando el intervalo RR si disponible
            const isRRShort = this.baseRRInterval > 0 && 
                              currentRR <= this.baseRRInterval * (1 - this.MIN_RR_VARIATION_FOR_PREMATURE);
            
            // Solo clasificar como prematuro si el intervalo también es sospechoso
            if (isRRShort) {
              peakType = 'premature';
              peakQuality = 0.5 + (this.AMPLITUDE_RATIO_THRESHOLD - ratio) / (this.AMPLITUDE_RATIO_THRESHOLD * 2);
            } else {
              // Si la amplitud es baja pero el intervalo no es corto, es probablemente ruido
              peakType = 'unknown';
              peakQuality = 0.3;
            }
            
            this.consecNormalBeats = 0;
          } else {
            // MEJORA: Zona de incertidumbre más clara
            peakType = 'unknown';
            peakQuality = 0.4;
            // Disminuir contador de latidos normales sin reiniciarlo completamente
            this.consecNormalBeats = Math.max(0, this.consecNormalBeats - 1);
          }
        }
        
        // OPTIMIZADO: Registro de picos con más metadatos
        this.peakSequence.push({
          amplitude: absAmplitude,
          time: currentTime,
          type: peakType,
          rr: currentRR > 0 ? currentRR : undefined,
          quality: peakQuality
        });
        
        // Mantener ventana de análisis adecuada
        if (this.peakSequence.length > 15) { // Aumentado de 10 a 15
          this.peakSequence.shift();
        }
      }
    }
    
    this.updateLearningPhase();
  }

  /**
   * ALGORITMO MEJORADO: Detecta SOLO latidos prematuros verdaderos con validación multi-factor
   * y reducción agresiva de falsos positivos
   */
  detect(): {
    detected: boolean;
    count: number;
    status: string;
    data: { rmssd: number; rrVariation: number; prematureBeat: boolean } | null;
  } {
    // Datos insuficientes o fase de aprendizaje
    if (this.rrIntervals.length < 6 || this.amplitudes.length < 6 || this.peakSequence.length < 6) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: this.hasDetectedFirstArrhythmia ? 
          `ARRITMIA DETECTADA|${this.arrhythmiaCount}` : 
          `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: null
      };
    }

    // Si todavía estamos en fase de aprendizaje, no detectar arritmias
    if (this.isLearningPhase) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `CALIBRANDO|${this.arrhythmiaCount}`,
        data: null
      };
    }

    const currentTime = Date.now();
    
    // OPTIMIZADO: Cálculo de RMSSD con pesos dinámicos
    // RMSSD = Root Mean Square of Successive Differences (métrica clínica estándar)
    let sumSquaredDiff = 0;
    let weightSum = 0;
    
    for (let i = 1; i < this.rrIntervals.length; i++) {
      const diff = this.rrIntervals[i] - this.rrIntervals[i-1];
      // Pesos mayores a intervalos más recientes
      const weight = 1 + (i / this.rrIntervals.length); 
      sumSquaredDiff += (diff * diff) * weight;
      weightSum += weight;
    }
    
    const rmssd = Math.sqrt(sumSquaredDiff / (weightSum || 1));
    this.lastRMSSD = rmssd;
    
    // ALGORITMO OPTIMIZADO:
    // 1. Verificar estabilidad previa más exigente
    // 2. Buscar patrón específico con validación múltiple
    // 3. Sistema de puntuación de confianza para filtrar falsos positivos
    
    let prematureBeatDetected = false;
    let confidenceScore = 0;
    
    // OPTIMIZADO: Primera validación más estricta
    // Requerir suficientes latidos normales antes de permitir detección
    if (this.consecNormalBeats < this.MIN_NORMAL_BEATS_BEFORE_DETECTION && 
        !this.hasDetectedFirstArrhythmia) {
      return {
        detected: false,
        count: this.arrhythmiaCount,
        status: `SIN ARRITMIAS|${this.arrhythmiaCount}`,
        data: { rmssd, rrVariation: 0, prematureBeat: false }
      };
    }
    
    // OPTIMIZADO: Cálculo adaptativo de amplitud normal
    // Si tenemos suficientes picos normales recientes, usar promedio ponderado
    if (this.recentNormalPeakAmplitudes.length >= 3) {
      const recentAvg = this.recentNormalPeakAmplitudes.reduce((sum, val) => sum + val, 0) / 
                        this.recentNormalPeakAmplitudes.length;
      
      // Actualizar promedio normal con peso 30/70 (30% nuevo, 70% histórico)
      if (this.avgNormalAmplitude > 0) {
        this.avgNormalAmplitude = this.avgNormalAmplitude * 0.7 + recentAvg * 0.3;
      }
    }
    
    // ALGORITMO MEJORADO: Búsqueda avanzada del patrón específico de latido prematuro
    if (this.peakSequence.length >= 5 && this.avgNormalAmplitude > 0) {
      // Verificamos los últimos picos (usamos 5 para mejor contexto)
      const lastPeaks = this.peakSequence.slice(-5);
      
      // OPTIMIZADO: Re-clasificación dinámica
      for (let i = 0; i < lastPeaks.length; i++) {
        const peak = lastPeaks[i];
        const ratio = peak.amplitude / this.avgNormalAmplitude;
        
        // Clasificación precisa basada en amplitud
        if (ratio >= this.NORMAL_PEAK_MIN_THRESHOLD) {
          lastPeaks[i].type = 'normal';
          lastPeaks[i].quality = Math.min(1.0, ratio / 1.2);
        } else if (ratio <= this.AMPLITUDE_RATIO_THRESHOLD) {
          // Verificar también intervalo RR si disponible
          if (peak.rr && this.baseRRInterval > 0 && 
              peak.rr <= this.baseRRInterval * (1 - this.MIN_RR_VARIATION_FOR_PREMATURE)) {
            lastPeaks[i].type = 'premature';
            lastPeaks[i].quality = 0.5 + (this.AMPLITUDE_RATIO_THRESHOLD - ratio) / (this.AMPLITUDE_RATIO_THRESHOLD * 2);
          } else {
            lastPeaks[i].type = 'unknown';
            lastPeaks[i].quality = 0.3;
          }
        } else {
          lastPeaks[i].type = 'unknown';
          lastPeaks[i].quality = 0.4;
        }
      }
      
      // MEJORADO: Buscar patrones N-P-N más estrictos
      let patternDetected = false;
      let patternStartIdx = -1;
      
      // Verificar patrón clásico N-P-N en los últimos 3 picos
      if (
        lastPeaks.length >= 3 &&
        lastPeaks[lastPeaks.length-3].type === 'normal' && 
        lastPeaks[lastPeaks.length-2].type === 'premature' && 
        lastPeaks[lastPeaks.length-1].type === 'normal'
      ) {
        patternDetected = true;
        patternStartIdx = lastPeaks.length-3;
      }
      
      // Verificar patrón N-P-N en posición -4, -3, -2 (con pico normal adicional al final)
      else if (
        lastPeaks.length >= 4 &&
        lastPeaks[lastPeaks.length-4].type === 'normal' && 
        lastPeaks[lastPeaks.length-3].type === 'premature' && 
        lastPeaks[lastPeaks.length-2].type === 'normal' &&
        lastPeaks[lastPeaks.length-1].type === 'normal'
      ) {
        patternDetected = true;
        patternStartIdx = lastPeaks.length-4;
      }
      
      // MEJORADO: Validación exhaustiva del patrón
      if (patternDetected && patternStartIdx >= 0) {
        // Obtener los 3 picos que forman el patrón
        const normal1 = lastPeaks[patternStartIdx];
        const premature = lastPeaks[patternStartIdx + 1];
        const normal2 = lastPeaks[patternStartIdx + 2];
        
        // Calcular ratios para validación estricta
        const normal1Ratio = normal1.amplitude / this.avgNormalAmplitude;
        const prematureRatio = premature.amplitude / this.avgNormalAmplitude;
        const normal2Ratio = normal2.amplitude / this.avgNormalAmplitude;
        
        // OPTIMIZADO: Sistema de puntuación de confianza multicriteria
        let totalScore = 0;
        let criteriaCount = 0;
        
        // Criterio 1: El pico prematuro debe ser significativamente más pequeño
        const criterion1 = prematureRatio <= this.AMPLITUDE_RATIO_THRESHOLD;
        totalScore += criterion1 ? 1 : 0;
        criteriaCount++;
        
        // Criterio 2: Los picos normales deben ser suficientemente grandes
        const criterion2 = normal1Ratio >= this.NORMAL_PEAK_MIN_THRESHOLD && 
                          normal2Ratio >= this.NORMAL_PEAK_MIN_THRESHOLD;
        totalScore += criterion2 ? 1 : 0;
        criteriaCount++;
        
        // Criterio 3: El pico prematuro debe ser al menos ~30% más pequeño que el promedio de los normales
        const criterion3 = prematureRatio <= (normal1Ratio + normal2Ratio) / 2 * 0.7;
        totalScore += criterion3 ? 1 : 0;
        criteriaCount++;
        
        // Criterio 4: Validación de intervalos temporales
        let criterion4 = false;
        if (premature.rr !== undefined && normal2.rr !== undefined && this.baseRRInterval > 0) {
          // El intervalo del latido prematuro debe ser más corto que el normal
          criterion4 = premature.rr <= this.baseRRInterval * (1 - this.MIN_RR_VARIATION_FOR_PREMATURE);
          totalScore += criterion4 ? 1 : 0;
          criteriaCount++;
        }
        
        // Criterio 5: Diferencia de tiempo desde el último latido prematuro detectado
        const criterion5 = this.lastArrhythmiaTime === 0 || 
                          (currentTime - this.lastArrhythmiaTime > this.MAX_PREMATURE_INTERVAL_MS);
        totalScore += criterion5 ? 1 : 0;
        criteriaCount++;
        
        // Criterio 6: Calidad intrínseca de los picos
        const avgQuality = (normal1.quality || 0.5) * 0.3 + 
                          (premature.quality || 0.5) * 0.4 +
                          (normal2.quality || 0.5) * 0.3;
        const criterion6 = avgQuality > 0.6;
        totalScore += criterion6 ? 1 : 0;
        criteriaCount++;
        
        // Calcular puntuación final normalizada
        confidenceScore = totalScore / criteriaCount;
        
        // Almacenar puntuación para análisis de tendencias
        this.lastConfidenceScores.push(confidenceScore);
        if (this.lastConfidenceScores.length > 5) {
          this.lastConfidenceScores.shift();
        }
        
        // OPTIMIZADO: Detección final basada en umbral de confianza
        if (confidenceScore >= this.MIN_CONFIDENCE_SCORE) {
          prematureBeatDetected = true;
          
          // Reiniciar contador de falsos positivos
          this.falsePositiveStreak = 0;
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - LATIDO PREMATURO VALIDADO', {
              confianza: confidenceScore.toFixed(2),
              prematuroRatio: prematureRatio.toFixed(2),
              normal1Ratio: normal1Ratio.toFixed(2),
              normal2Ratio: normal2Ratio.toFixed(2),
              criterios: {
                amplitudPrematura: criterion1,
                amplitudNormal: criterion2, 
                diferenciaPicos: criterion3,
                intervalosRR: criterion4,
                tiempoDesdeUltimo: criterion5,
                calidadPicos: criterion6
              },
              puntuaciónTotal: totalScore,
              criteriosTotales: criteriaCount
            });
          }
        } else {
          // Incrementar contador de falsos positivos potenciales
          this.falsePositiveStreak++;
          
          if (this.DEBUG_MODE) {
            console.log('ArrhythmiaDetector - Patrón detectado pero CONFIANZA INSUFICIENTE', {
              confianza: confidenceScore.toFixed(2),
              umbralNecesario: this.MIN_CONFIDENCE_SCORE,
              razonPrematura: prematureRatio.toFixed(2),
              razonNormal1: normal1Ratio.toFixed(2),
              razonNormal2: normal2Ratio.toFixed(2)
            });
          }
        }
      }
    }
    
    // OPTIMIZADO: Si detectamos demasiados falsos positivos consecutivos, 
    // aumentar temporalmente el umbral de confianza
    if (this.falsePositiveStreak > this.MAX_FALSE_POSITIVE_STREAK) {
      // Filtrar la detección actual si la confianza no es muy alta
      if (confidenceScore < 0.9) {
        prematureBeatDetected = false;
        
        if (this.DEBUG_MODE) {
          console.log('ArrhythmiaDetector - FILTRO DE FALSOS POSITIVOS APLICADO', {
            rachaFalsosPositivos: this.falsePositiveStreak,
            confianzaNecesaria: 0.9,
            confianzaActual: confidenceScore
          });
        }
      }
    }
    
    // Calcular variación RR para información adicional
    const rrVariation = (this.rrIntervals.length > 1 && this.baseRRInterval > 0) ? 
      Math.abs(this.rrIntervals[this.rrIntervals.length - 1] - this.baseRRInterval) / this.baseRRInterval : 
      0;
    this.lastRRVariation = rrVariation;
    
    // OPTIMIZADO: Contabilización de arritmias con validación temporal
    if (prematureBeatDetected && 
        currentTime - this.lastArrhythmiaTime > this.MAX_PREMATURE_INTERVAL_MS) {
      this.arrhythmiaCount++;
      this.lastArrhythmiaTime = currentTime;
      this.hasDetectedFirstArrhythmia = true;
      
      if (this.DEBUG_MODE) {
        console.log('ArrhythmiaDetector - NUEVA ARRITMIA CONTABILIZADA:', {
          count: this.arrhythmiaCount,
          timestamp: currentTime,
          confianza: confidenceScore.toFixed(2)
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
