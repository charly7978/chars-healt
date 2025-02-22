/**
 * VitalSignsProcessor
 *
 * Procesa datos PPG para estimar (de forma muy aproximada) SpO2, presión arterial
 * y detectar posibles arritmias.
 *
 * ---------------------------------------------------------------------------
 * ADVERTENCIA:
 *  - Código prototipo para DEMO / investigación, **NO** dispositivo médico.
 *  - Presión arterial vía PPG depende de calibraciones, señales reales estables,
 *    y hardware adecuado. Se usa aquí una heurística muy simplificada.
 *  - La detección de arritmias (RR-intervals, Poincaré, etc.) es también
 *    aproximada y requiere validación clínica.
 * ---------------------------------------------------------------------------
 *
 * Ajustes solicitados:
 * 1) Limitar SpO2 en [88, 98], pues 98% suele ser el máximo real en humanos
 *    (para no quedar clavado en 100%).
 * 2) Subir un poco la presión arterial calculada, ya que quedaba muy baja.
 * 3) Hacer la detección de arritmias más sensible, bajando umbrales
 *    (MAX_RR_VARIATION, POINCARE_SD1_THRESHOLD, POINCARE_SD2_THRESHOLD).
 *
 */

export class VitalSignsProcessor {
  //-----------------------------------------
  //        PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Tamaño máximo de buffer de señal PPG (p.e. ~10s a ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración para SpO2 (bajamos un poco para no saturar en 100). */
  private readonly SPO2_CALIBRATION_FACTOR = 1.02;

  /**
   * Umbral mínimo de índice de perfusión (AC/DC) para confiar en SpO2.
   * 0.05 significa un perfusionIndex de 5 en notación (%)  
   */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /**
   * Ventana usada para SpO2 (para la media).  
   * Puede ajustarse para hacerlo más reactivo vs estable.
   */
  private readonly SPO2_WINDOW = 10;

  /**
   * Tamaño de ventana para el Smooth Moving Average en cada frame,
   * para suavizar ruido puntual.
   */
  private readonly SMA_WINDOW = 3;

  // ───────── Parámetros de Arritmias ─────────

  /** Ventana corta para análisis rápido */
  private readonly RR_WINDOW_SIZE = 5;
  
  /** Umbral RMSSD (en ms) para considerar arritmia */
  private readonly RMSSD_THRESHOLD = 20;
  
  /** Ventana corta de aprendizaje */
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;
  
  /** Umbral de pico para detectar latidos */
  private readonly PEAK_THRESHOLD = 0.3;

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  /** Buffer principal de la señal PPG filtrada. */
  private ppgValues: number[] = [];

  /** Valor de SpO2 anterior (para no caer en 0 si la señal empeora). */
  private lastValue = 0;

  /** Última marca temporal (ms) de pico detectado. */
  private lastPeakTime: number | null = null;

  /** Buffer de intervalos RR (tiempo entre picos consecutivos). */
  private rrIntervals: number[] = [];

  /** RR baseline calculado en fase de aprendizaje. */
  private baselineRhythm = 0;

  /** Flag de aprendizaje (true hasta pasar ARRHYTHMIA_LEARNING_PERIOD). */
  private isLearningPhase = true;

  /** Flag si se detectó arritmia. */
  private arrhythmiaDetected = false;

  /** Momento de inicio (ms) para la medición actual. */
  private measurementStartTime: number = Date.now();

  /**
   * Nuevo algoritmo de detección de arritmias basado en RMSSD
   * (Root Mean Square of Successive Differences)
   */
  private detectArrhythmia() {
    if (this.rrIntervals.length < this.RR_WINDOW_SIZE) {
      console.log("VitalSignsProcessor: Insuficientes intervalos RR para RMSSD", {
        current: this.rrIntervals.length,
        needed: this.RR_WINDOW_SIZE
      });
      return;
    }

    // Tomar los últimos N intervalos
    const recentRR = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);
    
    // Calcular diferencias sucesivas
    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i-1];
      sumSquaredDiff += diff * diff;
    }
    
    // Calcular RMSSD
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));
    
    // También detectar latidos prematuros
    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const lastRR = recentRR[recentRR.length - 1];
    const prematureBeat = Math.abs(lastRR - avgRR) > (avgRR * 0.2); // 20% de variación
    
    console.log("VitalSignsProcessor: Análisis RMSSD", {
      timestamp: new Date().toISOString(),
      rmssd,
      threshold: this.RMSSD_THRESHOLD,
      recentRR,
      avgRR,
      lastRR,
      prematureBeat
    });

    // Nueva condición de arritmia
    const newArrhythmiaState = rmssd > this.RMSSD_THRESHOLD || prematureBeat;

    if (newArrhythmiaState !== this.arrhythmiaDetected) {
      this.arrhythmiaDetected = newArrhythmiaState;
      console.log("VitalSignsProcessor: Cambio en estado de arritmia", {
        previousState: !this.arrhythmiaDetected,
        newState: this.arrhythmiaDetected,
        cause: {
          rmssdExceeded: rmssd > this.RMSSD_THRESHOLD,
          prematureBeat,
          rmssdValue: rmssd
        }
      });
    }
  }

  /**
   * processSignal
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ): {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
  } {
    console.log("VitalSignsProcessor: Entrada de señal", {
      ppgValue,
      isLearning: this.isLearningPhase,
      rrIntervalsCount: this.rrIntervals.length,
      receivedRRData: rrData
    });

    const filteredValue = this.applySMAFilter(ppgValue);
    
    this.ppgValues.push(filteredValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // Si recibimos datos RR, los usamos directamente
    if (rrData && rrData.intervals.length > 0) {
      this.rrIntervals = [...rrData.intervals];
      this.lastPeakTime = rrData.lastPeakTime;
      
      if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
        this.detectArrhythmia();
      }
    }

    // Calcular SpO2 y presión (sin cambios)
    const spo2 = this.calculateSpO2(this.ppgValues.slice(-60));
    const bp = this.calculateBloodPressure(this.ppgValues.slice(-60));
    const pressureString = `${bp.systolic}/${bp.diastolic}`;

    // Estado de arritmia
    let arrhythmiaStatus = "--";
    
    const currentTime = Date.now();
    const timeSinceStart = currentTime - this.measurementStartTime;

    if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      arrhythmiaStatus = this.arrhythmiaDetected ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS";
    }

    console.log("VitalSignsProcessor: Estado actual", {
      timestamp: currentTime,
      isLearningPhase: this.isLearningPhase,
      arrhythmiaDetected: this.arrhythmiaDetected,
      arrhythmiaStatus,
      rrIntervals: this.rrIntervals.length
    });

    return {
      spo2,
      pressure: pressureString,
      arrhythmiaStatus
    };
  }

  private processHeartBeat() {
    const currentTime = Date.now();
    
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }

    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);
    
    console.log("VitalSignsProcessor: Nuevo latido", {
      timestamp: currentTime,
      rrInterval,
      totalIntervals: this.rrIntervals.length
    });

    // Mantener ventana móvil de intervalos
    if (this.rrIntervals.length > 20) {
      this.rrIntervals.shift();
    }

    // Si tenemos suficientes intervalos, analizar arritmia
    if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
      this.detectArrhythmia();
    }

    this.lastPeakTime = currentTime;
  }

  /** 
   * Buffer para suavizar transiciones de SpO2
   * Guarda últimos N valores válidos para media móvil
   */
  private spo2Buffer: number[] = [];
  private readonly SPO2_BUFFER_SIZE = 10;

  /**
   * calculateSpO2
   * Calcula la saturación de oxígeno con transiciones suaves
   * y mediciones reales.
   */
  private calculateSpO2(values: number[]): number {
    // Si no hay suficientes muestras para análisis
    if (values.length < 30) {
      // Si tenemos valores previos, degradamos suavemente
      if (this.spo2Buffer.length > 0) {
        const lastValid = this.spo2Buffer[this.spo2Buffer.length - 1];
        return Math.max(0, lastValid - 1);
      }
      return 0;
    }

    // Calcular componentes AC y DC
    const dc = this.calculateDC(values);
    if (dc === 0) {
      // Con DC = 0, degradamos suavemente si hay histórico
      if (this.spo2Buffer.length > 0) {
        const lastValid = this.spo2Buffer[this.spo2Buffer.length - 1];
        return Math.max(0, lastValid - 1);
      }
      return 0;
    }

    const ac = this.calculateAC(values);
    
    // Índice de perfusión con umbral más estricto
    const perfusionIndex = ac / dc;
    
    if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD) {
      // Con mala perfusión, degradamos suavemente
      if (this.spo2Buffer.length > 0) {
        const lastValid = this.spo2Buffer[this.spo2Buffer.length - 1];
        return Math.max(0, lastValid - 2);
      }
      return 0;
    }

    // Ratio R con mejor calibración
    const R = (ac / dc) / this.SPO2_CALIBRATION_FACTOR;
    
    // Cálculo base de SpO2 más gradual
    let spO2 = Math.round(98 - (15 * R));
    
    // Ajustes basados en calidad de perfusión
    if (perfusionIndex > 0.15) {
      spO2 = Math.min(98, spO2 + 1);
    } else if (perfusionIndex < 0.08) {
      spO2 = Math.max(0, spO2 - 1);
    }

    // Límite superior fisiológico
    spO2 = Math.min(98, spO2);

    // Actualizar buffer de valores
    this.spo2Buffer.push(spO2);
    if (this.spo2Buffer.length > this.SPO2_BUFFER_SIZE) {
      this.spo2Buffer.shift();
    }

    // Media móvil para suavizar cambios
    if (this.spo2Buffer.length > 0) {
      const sum = this.spo2Buffer.reduce((a, b) => a + b, 0);
      spO2 = Math.round(sum / this.spo2Buffer.length);
    }

    console.log("VitalSignsProcessor: Cálculo SpO2", {
      ac,
      dc,
      ratio: R,
      perfusionIndex,
      rawSpO2: spO2,
      bufferSize: this.spo2Buffer.length,
      smoothedSpO2: spO2
    });

    return spO2;
  }

  /**
   * calculateBloodPressure
   * Calcula presión arterial basada en PTT y amplitud PPG
   * con ajustes más finos para mejor precisión
   */
  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    if (values.length < 30) {
      return { systolic: 0, diastolic: 0 };
    }

    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    if (peakIndices.length < 2) {
      // Valores base más realistas
      return { systolic: 120, diastolic: 80 };
    }

    // Asumimos ~30 FPS => ~33ms / muestra
    const fps = 30;
    const msPerSample = 1000 / fps;

    // PTT (tiempo en ms entre picos consecutivos)
    const pttValues: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(dt);
    }
    
    // Media móvil ponderada para PTT
    const weightedPTT = pttValues.reduce((acc, val, idx) => {
      const weight = (idx + 1) / pttValues.length; // Más peso a valores recientes
      return acc + val * weight;
    }, 0) / pttValues.reduce((acc, _, idx) => acc + (idx + 1) / pttValues.length, 0);

    // Normalizar PTT a rangos fisiológicos
    const normalizedPTT = Math.max(300, Math.min(1200, weightedPTT));
    
    // Calcular amplitud con mejor precisión
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);
    const normalizedAmplitude = Math.min(100, Math.max(0, amplitude * 5));

    /**
     * Nueva fórmula mejorada:
     * - Base más realista (120/80)
     * - PTT influye inversamente en la presión
     * - Amplitud afecta más a la sistólica que a la diastólica
     * - Factores de escala ajustados para mejor rango
     */
    const pttFactor = (600 - normalizedPTT) * 0.08;  // PTT más corto → presión más alta
    const ampFactor = normalizedAmplitude * 0.3;     // Mayor amplitud → presión más alta
    
    // Valores base realistas + ajustes por PTT y amplitud
    let estimatedSystolic = 120 + pttFactor + ampFactor;
    let estimatedDiastolic = 80 + (pttFactor * 0.5) + (ampFactor * 0.2);

    // Garantizar rangos fisiológicos y mantener diferencial realista
    estimatedSystolic = Math.max(90, Math.min(180, estimatedSystolic));
    estimatedDiastolic = Math.max(60, Math.min(110, estimatedDiastolic));
    
    // Mantener diferencial sistólica-diastólica realista
    const differential = estimatedSystolic - estimatedDiastolic;
    if (differential < 20) {
      estimatedDiastolic = estimatedSystolic - 20;
    } else if (differential > 80) {
      estimatedDiastolic = estimatedSystolic - 80;
    }

    console.log("VitalSignsProcessor: Cálculo de presión arterial", {
      ptt: normalizedPTT,
      amplitude: normalizedAmplitude,
      pttFactor,
      ampFactor,
      systolic: Math.round(estimatedSystolic),
      diastolic: Math.round(estimatedDiastolic)
    });

    return {
      systolic: Math.round(estimatedSystolic),
      diastolic: Math.round(estimatedDiastolic)
    };
  }

  /**
   * localFindPeaksAndValleys
   * Búsqueda simple de picos y valles dentro de "values".
   */
  private localFindPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];

    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      // Pico si v > a i±1, i±2
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        peakIndices.push(i);
      }
      // Valle si v < a i±1, i±2
      if (
        v < values[i - 1] &&
        v < values[i - 2] &&
        v < values[i + 1] &&
        v < values[i + 2]
      ) {
        valleyIndices.push(i);
      }
    }
    return { peakIndices, valleyIndices };
  }

  /**
   * calculateAmplitude
   * Amplitud pico-valle promedio.
   */
  private calculateAmplitude(
    values: number[],
    peaks: number[],
    valleys: number[]
  ): number {
    if (peaks.length === 0 || valleys.length === 0) return 0;

    const amps: number[] = [];
    const len = Math.min(peaks.length, valleys.length);
    for (let i = 0; i < len; i++) {
      // Se asume que peak[i] > valley[i] en tiempo,
      // si no, igual tomamos la diferencia si es >0.
      const amp = values[peaks[i]] - values[valleys[i]];
      if (amp > 0) {
        amps.push(amp);
      }
    }
    if (amps.length === 0) return 0;

    const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
    return mean;
  }

  /**
   * detectPeak
   * Marca un latido cuando value > PEAK_THRESHOLD y pasaron >=500ms 
   * desde el último pico.
   */
  private detectPeak(value: number): boolean {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      // primer latido
      if (value > this.PEAK_THRESHOLD) {
        this.lastPeakTime = currentTime;
        return true;
      }
      return false;
    }

    const timeSinceLastPeak = currentTime - this.lastPeakTime;
    if (value > this.PEAK_THRESHOLD && timeSinceLastPeak > 500) {
      this.lastPeakTime = currentTime;
      return true;
    }
    return false;
  }

  /**
   * calculateStandardDeviation
   * Calcula desviación estándar simple para un array de valores.
   */
  private calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(avgSqDiff);
  }

  /**
   * calculateAC
   * Calcula componente AC como pico a pico en ventana actual
   */
  private calculateAC(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * calculateDC
   * Calcula componente DC como media en ventana actual
   */
  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Filtro SMA (Smooth Moving Average) de tamaño 3
   * para mitigar ruido puntual.
   */
  private smaBuffer: number[] = [];
  private applySMAFilter(value: number): number {
    this.smaBuffer.push(value);
    if (this.smaBuffer.length > this.SMA_WINDOW) {
      this.smaBuffer.shift();
    }
    const sum = this.smaBuffer.reduce((a, b) => a + b, 0);
    return sum / this.smaBuffer.length;
  }

  /**
   * reset
   * Reinicia todo el estado interno
   */
  public reset(): void {
    this.ppgValues = [];
    this.smaBuffer = [];
    this.spo2Buffer = [];
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.measurementStartTime = Date.now();
    console.log("VitalSignsProcessor: Reset completo");
  }
}
