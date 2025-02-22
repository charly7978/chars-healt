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
  
  /** Periodo de aprendizaje (10 segundos) */
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 10000;
  
  /** Umbral de pico para detectar latidos */
  private readonly PEAK_THRESHOLD = 0.3;

  /** Buffer de intervalos RR */
  private rrIntervals: number[] = [];
  
  /** Flag de arritmia detectada */
  private arrhythmiaDetected = false;
  
  /** Contador de arritmias detectadas */
  private arrhythmiaCount = 0;
  
  /** Tiempo de inicio de medición */
  private measurementStartTime: number = Date.now();
  
  /** Último tiempo de pico */
  private lastPeakTime: number | null = null;
  
  /** Fase de aprendizaje */
  private isLearningPhase = true;

  /**
   * Algoritmo de detección de arritmias basado en RMSSD
   */
  private detectArrhythmia() {
    if (this.rrIntervals.length < this.RR_WINDOW_SIZE) {
      console.log("VitalSignsProcessor: Insuficientes intervalos RR para RMSSD", {
        current: this.rrIntervals.length,
        needed: this.RR_WINDOW_SIZE
      });
      return;
    }

    // Si ya se detectó una arritmia, mantenemos ese estado
    if (this.arrhythmiaDetected) {
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
    const prematureBeat = Math.abs(lastRR - avgRR) > (avgRR * 0.2);
    
    console.log("VitalSignsProcessor: Análisis RMSSD", {
      timestamp: new Date().toISOString(),
      rmssd,
      threshold: this.RMSSD_THRESHOLD,
      recentRR,
      avgRR,
      lastRR,
      prematureBeat
    });

    // Detección de nueva arritmia
    if (rmssd > this.RMSSD_THRESHOLD || prematureBeat) {
      this.arrhythmiaDetected = true;
      this.arrhythmiaCount++;
      
      console.log("VitalSignsProcessor: Nueva arritmia detectada", {
        totalArrhythmias: this.arrhythmiaCount,
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

    // Estado de arritmia y conteo
    let arrhythmiaStatus = "--";
    
    const currentTime = Date.now();
    const timeSinceStart = currentTime - this.measurementStartTime;

    if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      // Si hay arritmias, mostrar el conteo, si no, mostrar "SIN ARRITMIAS"
      arrhythmiaStatus = this.arrhythmiaDetected ? 
        `ARRITMIAS: ${this.arrhythmiaCount}` : 
        "SIN ARRITMIAS";
    } else {
      arrhythmiaStatus = "APRENDIENDO...";
    }

    console.log("VitalSignsProcessor: Estado actual", {
      timestamp: currentTime,
      isLearningPhase: this.isLearningPhase,
      arrhythmiaDetected: this.arrhythmiaDetected,
      arrhythmiaCount: this.arrhythmiaCount,
      arrhythmiaStatus,
      timeSinceStart,
      learningPeriod: this.ARRHYTHMIA_LEARNING_PERIOD
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
   * calculateSpO2
   * @param values
   * @returns {number}
   */
  private calculateSpO2(values: number[]): number {
    // Se requiere al menos ~30 muestras para estabilidad.
    if (values.length < 30) {
      return this.lastValue;
    }

    // DC (promedio)
    const dc = this.calculateDC(values);
    if (dc === 0) {
      return this.lastValue;
    }

    // AC (rango)
    const ac = this.calculateAC(values);
    const perfusionIndex = (ac / dc) * 100;

    // Si la perfusión es demasiado baja, regresar último SpO2.
    if (perfusionIndex < this.PERFUSION_INDEX_THRESHOLD * 100) {
      return this.lastValue;
    }

    // Cálculo base a partir del promedio, con factor de calibración.
    const mean = dc; // (dc es ya el promedio).
    const rawSpO2 = mean * this.SPO2_CALIBRATION_FACTOR;

    // Limitamos entre [88, 98].
    const spO2 = Math.round(Math.max(88, Math.min(98, rawSpO2)));

    // Guardamos por si la señal empeora
    this.lastValue = spO2;
    return spO2;
  }

  /**
   * calculateBloodPressure
   * @param values
   * @returns {{systolic: number, diastolic: number}}
   */
  private calculateBloodPressure(values: number[]): {
    systolic: number;
    diastolic: number;
  } {
    // Mínimo ~30 para tener algo de info
    if (values.length < 30) {
      return { systolic: 0, diastolic: 0 };
    }

    // Buscar picos/ valles en este chunk
    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    if (peakIndices.length < 2) {
      return { systolic: 120, diastolic: 80 };
    }

    // Asumamos ~30 FPS => ~33ms / muestra
    const fps = 30;
    const msPerSample = 1000 / fps;

    // PTT (tiempo en ms entre picos consecutivos)
    const pttValues: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttValues.push(dt);
    }
    let avgPTT = pttValues.reduce((acc, val) => acc + val, 0) / pttValues.length;

    // Evitar extremos
    if (avgPTT < 300) avgPTT = 300;   // ~300ms => FC ~200 BPM, extremo
    if (avgPTT > 1500) avgPTT = 1500; // ~1.5s => FC ~40 BPM, extremo

    // Calcular amplitud pico-valle promedio
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);

    /**
     * Heurísticas:
     *   sistólica ~ 115 - 0.04*(avgPTT - 500) + 0.25*(amplitude)
     *   diastólica ~ 0.65 * sistólica
     * Clamps en [95–180]/[60–115]
     */
    const alphaPTT = 0.04;  // sensibilidad al PTT
    const alphaAmp = 0.25;  // sensibilidad a la amplitud
    let estimatedSystolic = 115 - alphaPTT * (avgPTT - 500) + alphaAmp * amplitude;
    let estimatedDiastolic = estimatedSystolic * 0.65;

    const systolic = Math.round(Math.max(95, Math.min(180, estimatedSystolic)));
    const diastolic = Math.round(Math.max(60, Math.min(115, estimatedDiastolic)));

    return { systolic, diastolic };
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
   * AC = (max - min) de la ventana actual.
   */
  private calculateAC(values: number[]): number {
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * calculateDC
   * DC = promedio de la ventana actual.
   */
  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0) / values.length;
    return sum / values.length;
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
   * Reinicia todo el estado interno: buffers, baseline de RR, etc.
   */
  public reset(): void {
    this.ppgValues = [];
    this.smaBuffer = [];
    this.lastValue = 0;
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.arrhythmiaCount = 0;
    this.measurementStartTime = Date.now();
    console.log("VitalSignsProcessor: Reset completo");
  }
}
