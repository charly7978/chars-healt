/**
 * VitalSignsProcessor
 *
 * Procesa datos PPG para estimar (de forma muy aproximada) SpO2, presión arterial
 * y detectar posibles arritmias.
 *
 * ---------------------------------------------------------------------------
 * ADVERTENCIA:
 *  - Código prototipo para DEMO / investigación, **NO** dispositivo médico.
 *  - La presión arterial vía PPG depende de calibraciones, señal real estable,
 *    y hardware adecuado. Aquí es una heurística muy simplificada.
 *  - La detección de arritmias (RR-intervals, Poincaré, RMSSD, etc.) es también
 *    aproximada y requiere validación clínica.
 * ---------------------------------------------------------------------------
 *
 * Ajustes Principales en esta versión:
 * 1. Se agregan filtros adicionales (buffers) y un "suavizado" (exp. o lineal)
 *    tanto en SpO2 como en Presión para reducir inestabilidades.
 * 2. SpO2 se clampa a [88, 98] y se evita saturar en 100.  
 * 3. Cálculo de Presión con heurísticas (PTT y amplitud), con un smoothing
 *    final que mezcla el nuevo valor con el último valor retornado.
 * 4. Se mantiene un método de detección de arritmias basado en RMSSD
 *    y en la detección de latidos prematuros (20% variación).
 */

export class VitalSignsProcessor {
  //-----------------------------------------
  //        PARÁMETROS GLOBALES
  //-----------------------------------------

  /** Tamaño máximo de buffer de señal PPG (~10s a ~30FPS). */
  private readonly WINDOW_SIZE = 300;

  /** Factor de calibración base para SpO2. */
  private readonly SPO2_CALIBRATION_FACTOR = 1.02;

  /**  
   * Umbral mínimo de índice de perfusión (AC/DC).  
   * El perfusionIndex debe superar 0.05 (~5%) para que la medición sea confiable.
   */
  private readonly PERFUSION_INDEX_THRESHOLD = 0.05;

  /**
   * Ventana usada para SpO2 (para la media).  
   * No se usa directamente en un loop, pero sirve de referencia
   * si necesitáramos promedios.
   */
  private readonly SPO2_WINDOW = 10;

  /**
   * Tamaño de ventana para el Smooth Moving Average
   * aplicado a cada valor entrante (para atenuar ruidos).
   */
  private readonly SMA_WINDOW = 3;

  /**  
   * Tamaño del buffer adicional para suavizar transiciones de SpO2.
   */
  private readonly SPO2_BUFFER_SIZE = 10;

  // ────────── Parámetros de Arritmias & RMSSD ──────────

  /** Ventana mínima para análisis RMSSD. */
  private readonly RR_WINDOW_SIZE = 5;

  /** Umbral RMSSD para sospechar arritmia (ms). */
  private readonly RMSSD_THRESHOLD = 20;

  /** Periodo de aprendizaje de arritmias (ms). */
  private readonly ARRHYTHMIA_LEARNING_PERIOD = 3000;

  /** Umbral de pico para detectar latidos. */
  private readonly PEAK_THRESHOLD = 0.3;

  //-----------------------------------------
  //           VARIABLES INTERNAS
  //-----------------------------------------

  /** Buffer principal de la señal PPG filtrada. */
  private ppgValues: number[] = [];

  /** Último valor de SpO2 para no caer a 0 si la señal es mala momentáneamente. */
  private lastValue = 0;

  /**
   * Para controlar la última presión calculada y así hacer un suavizado
   * (en lugar de cambiar bruscamente).
   */
  private lastSystolic = 120;
  private lastDiastolic = 80;

  /** Marca de tiempo (ms) del último pico detectado. */
  private lastPeakTime: number | null = null;

  /** Buffer de intervalos RR (distancia en ms entre picos consecutivos). */
  private rrIntervals: number[] = [];

  /** Fase de aprendizaje de arritmias (true hasta que pasen ARRHYTHMIA_LEARNING_PERIOD ms). */
  private isLearningPhase = true;

  /** Estado si se detectó arritmia. */
  private arrhythmiaDetected = false;

  /** Instante (ms) de inicio de la medición. */
  private measurementStartTime: number = Date.now();

  /** Buffer adicional para suavizar lecturas de SpO2. */
  private spo2Buffer: number[] = [];

  /** Filtro SMA, se acumulan hasta 3 muestras para promediar. */
  private smaBuffer: number[] = [];

  constructor() {
    this.measurementStartTime = Date.now();
  }

  /**
   * processSignal
   * Procesa un nuevo valor PPG y retorna SpO2, presión y estado de arritmia.
   * @param ppgValue Valor crudo de PPG (ej. 0..1 normalizado o similar).
   * @param rrData (opcional) Si ya calculaste RR con otra lógica, puedes pasarla aquí.
   */
  public processSignal(
    ppgValue: number,
    rrData?: { intervals: number[]; lastPeakTime: number | null }
  ): {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
  } {
    // 1) Filtrar la muestra con un SMA de 3
    const filteredValue = this.applySMAFilter(ppgValue);

    // 2) Almacenar en buffer principal
    this.ppgValues.push(filteredValue);
    if (this.ppgValues.length > this.WINDOW_SIZE) {
      this.ppgValues.shift();
    }

    // 3) Si recibimos datos RR externos, los usamos
    if (rrData && rrData.intervals?.length) {
      this.rrIntervals = [...rrData.intervals];
      this.lastPeakTime = rrData.lastPeakTime || this.lastPeakTime;
      if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
        this.detectArrhythmia();
      }
    } else {
      // Si no, podemos detectar picos localmente
      const isPeak = this.detectPeak(filteredValue);
      if (isPeak) {
        this.processHeartBeat();
      }
    }

    // 4) Cálculo de SpO2
    const chunkForSpO2 = this.ppgValues.slice(-60); // últimos 2s aprox. a 30FPS
    let spo2 = this.calculateSpO2(chunkForSpO2);

    // Suavizado final con el último valor
    // para evitar saltos bruscos:
    spo2 = Math.round(0.7 * this.lastValue + 0.3 * spo2);
    // Clampeo a [88, 98]
    spo2 = Math.max(88, Math.min(98, spo2));
    this.lastValue = spo2;

    // 5) Cálculo de Presión Arterial
    const chunkForBP = this.ppgValues.slice(-60);
    const rawBP = this.calculateBloodPressure(chunkForBP);

    // Se hace un suavizado respecto al último
    const newSys = 0.3 * rawBP.systolic + 0.7 * this.lastSystolic;
    const newDia = 0.3 * rawBP.diastolic + 0.7 * this.lastDiastolic;

    const finalSys = Math.round(newSys);
    const finalDia = Math.round(newDia);

    // Actualizamos
    this.lastSystolic = finalSys;
    this.lastDiastolic = finalDia;

    const pressureString = `${finalSys}/${finalDia}`;

    // 6) Estado de arritmia
    const currentTime = Date.now();
    const timeSinceStart = currentTime - this.measurementStartTime;
    let arrhythmiaStatus = "--";

    if (timeSinceStart > this.ARRHYTHMIA_LEARNING_PERIOD) {
      this.isLearningPhase = false;
      arrhythmiaStatus = this.arrhythmiaDetected ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS";
    }

    return {
      spo2,
      pressure: pressureString,
      arrhythmiaStatus
    };
  }

  /**
   * detectArrhythmia
   * Usa RMSSD en la ventana de los últimos RR_WINDOW_SIZE latidos
   * y chequea si hay latido prematuro (>20% variación).
   */
  private detectArrhythmia() {
    if (this.rrIntervals.length < this.RR_WINDOW_SIZE) {
      return;
    }
    const recentRR = this.rrIntervals.slice(-this.RR_WINDOW_SIZE);

    let sumSquaredDiff = 0;
    for (let i = 1; i < recentRR.length; i++) {
      const diff = recentRR[i] - recentRR[i - 1];
      sumSquaredDiff += diff * diff;
    }
    const rmssd = Math.sqrt(sumSquaredDiff / (recentRR.length - 1));

    const avgRR = recentRR.reduce((a, b) => a + b, 0) / recentRR.length;
    const lastRR = recentRR[recentRR.length - 1];
    // Latido prematuro si difiere >20% del promedio
    const prematureBeat = Math.abs(lastRR - avgRR) > avgRR * 0.2;

    // Arritmia si RMSSD > threshold o latido prematuro
    const newArrhythmiaState = rmssd > this.RMSSD_THRESHOLD || prematureBeat;
    if (newArrhythmiaState !== this.arrhythmiaDetected) {
      this.arrhythmiaDetected = newArrhythmiaState;
      console.log("VitalSignsProcessor: Cambio de estado de arritmia =>", this.arrhythmiaDetected, {
        rmssd,
        prematureBeat,
        recentRR
      });
    }
  }

  /**
   * processHeartBeat
   * Lógica interna cuando se detecta un nuevo pico.
   */
  private processHeartBeat() {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      this.lastPeakTime = currentTime;
      return;
    }

    const rrInterval = currentTime - this.lastPeakTime;
    this.rrIntervals.push(rrInterval);

    // Mantén la cola ~20
    if (this.rrIntervals.length > 20) {
      this.rrIntervals.shift();
    }

    if (!this.isLearningPhase && this.rrIntervals.length >= this.RR_WINDOW_SIZE) {
      this.detectArrhythmia();
    }
    this.lastPeakTime = currentTime;
  }

  /**
   * calculateSpO2
   * Cálculo base de SpO2 usando AC/DC, perfusionIndex, etc.
   * Se añade un pequeño buffer local (spo2Buffer) y se
   * aplica un factor de calibración.
   */
  private calculateSpO2(values: number[]): number {
    if (values.length < 30) {
      // Pocas muestras => devuelvo último SpO2 si existe
      if (this.spo2Buffer.length > 0) {
        return this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      return 0;
    }

    const dc = this.calculateDC(values);
    if (dc <= 0) {
      if (this.spo2Buffer.length > 0) {
        return this.spo2Buffer[this.spo2Buffer.length - 1];
      }
      return 0;
    }

    const ac = this.calculateAC(values);
    const perfIndex = ac / dc;

    // Si perfusión es muy baja, no confiamos en el valor
    if (perfIndex < this.PERFUSION_INDEX_THRESHOLD) {
      if (this.spo2Buffer.length > 0) {
        return Math.max(0, this.spo2Buffer[this.spo2Buffer.length - 1] - 1);
      }
      return 0;
    }

    // Ratio R
    const R = (ac / dc) / this.SPO2_CALIBRATION_FACTOR;
    // Heurística: spO2 ~ 98 - 15*R
    let rawSpO2 = 98 - 15 * R;
    rawSpO2 = Math.max(88, Math.min(100, rawSpO2)); // clamp tentativo

    // Buffer local
    const spO2 = Math.round(rawSpO2);
    this.spo2Buffer.push(spO2);
    if (this.spo2Buffer.length > this.SPO2_BUFFER_SIZE) {
      this.spo2Buffer.shift();
    }

    // Suavizado usando la media del buffer
    const sum = this.spo2Buffer.reduce((a, b) => a + b, 0);
    const average = sum / this.spo2Buffer.length;

    return Math.round(average);
  }

  /**
   * calculateBloodPressure
   * Heurística usando PTT y amplitud pico-valle (en la ventana de ~2s).
   */
  private calculateBloodPressure(values: number[]): { systolic: number; diastolic: number } {
    if (values.length < 30) {
      // Pocas muestras => valor default
      return { systolic: 120, diastolic: 80 };
    }

    const { peakIndices, valleyIndices } = this.localFindPeaksAndValleys(values);
    if (peakIndices.length < 2) {
      // Sin picos suficientes => valor default
      return { systolic: 120, diastolic: 80 };
    }

    // Suponiendo ~30 FPS => ~33ms por muestra
    const fps = 30;
    const msPerSample = 1000 / fps;

    // Calcular PTT
    const pttArr: number[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const dt = (peakIndices[i] - peakIndices[i - 1]) * msPerSample;
      pttArr.push(dt);
    }
    let avgPTT = pttArr.reduce((sum, v) => sum + v, 0) / pttArr.length;

    // Evitar extremos
    if (avgPTT < 300) avgPTT = 300;
    if (avgPTT > 1500) avgPTT = 1500;

    // Amplitud pico-valle promedio
    const amplitude = this.calculateAmplitude(values, peakIndices, valleyIndices);

    // Heurística
    // sistólica ~ 115 - 0.04*(avgPTT - 500) + 0.25*(amplitude)
    // diastólica ~ 0.65 * sistólica
    // clamps [95–180]/[60–115]
    let estimatedSystolic = 115 - 0.04 * (avgPTT - 500) + 0.25 * amplitude;
    let estimatedDiastolic = estimatedSystolic * 0.65;

    const sys = Math.round(Math.max(95, Math.min(180, estimatedSystolic)));
    const dia = Math.round(Math.max(60, Math.min(115, estimatedDiastolic)));

    return { systolic: sys, diastolic: dia };
  }

  /**
   * localFindPeaksAndValleys
   * Método local sencillo para detectar picos y valles.
   */
  private localFindPeaksAndValleys(values: number[]) {
    const peakIndices: number[] = [];
    const valleyIndices: number[] = [];

    for (let i = 2; i < values.length - 2; i++) {
      const v = values[i];
      // Pico si v > vecinos i±1, i±2
      if (
        v > values[i - 1] &&
        v > values[i - 2] &&
        v > values[i + 1] &&
        v > values[i + 2]
      ) {
        peakIndices.push(i);
      }
      // Valle si v < vecinos i±1, i±2
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
  private calculateAmplitude(values: number[], peaks: number[], valleys: number[]): number {
    if (peaks.length === 0 || valleys.length === 0) return 0;

    const amps: number[] = [];
    const length = Math.min(peaks.length, valleys.length);
    for (let i = 0; i < length; i++) {
      const diff = values[peaks[i]] - values[valleys[i]];
      if (diff > 0) {
        amps.push(diff);
      }
    }
    if (!amps.length) return 0;

    const meanAmp = amps.reduce((a, b) => a + b, 0) / amps.length;
    return meanAmp;
  }

  /**
   * detectPeak
   * Marca un pico (latido) cuando value > PEAK_THRESHOLD y pasaron >=500ms
   * desde el último pico.
   */
  private detectPeak(value: number): boolean {
    const currentTime = Date.now();
    if (this.lastPeakTime === null) {
      // primer pico
      if (value > this.PEAK_THRESHOLD) {
        this.lastPeakTime = currentTime;
        return true;
      }
      return false;
    }

    const timeSinceLast = currentTime - this.lastPeakTime;
    if (value > this.PEAK_THRESHOLD && timeSinceLast > 500) {
      this.lastPeakTime = currentTime;
      return true;
    }
    return false;
  }

  /**
   * calculateAC
   * AC = max - min en la ventana actual
   */
  private calculateAC(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * calculateDC
   * DC = promedio de la ventana actual
   */
  private calculateDC(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  /**
   * applySMAFilter
   * Smooth Moving Average (ventana=3) para atenuar ruido puntual.
   */
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
   * Reinicia todo el estado interno: buffers, baseline, etc.
   */
  public reset(): void {
    this.ppgValues = [];
    this.smaBuffer = [];
    this.spo2Buffer = [];
    this.lastValue = 88;  // valor inicial razonable
    this.lastPeakTime = null;
    this.rrIntervals = [];
    this.isLearningPhase = true;
    this.arrhythmiaDetected = false;
    this.lastSystolic = 120;
    this.lastDiastolic = 80;
    this.measurementStartTime = Date.now();

    console.log("VitalSignsProcessor: Reset completo");
  }
}
